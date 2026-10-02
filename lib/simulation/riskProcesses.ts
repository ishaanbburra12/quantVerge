/**
 * Return-generating processes used by the Risk Analyzer.
 *
 * The purpose of offering four processes is comparative: run the same risk
 * metrics against data with known tail behaviour and see which metrics notice.
 * The Gaussian case is the control, where every parametric formula is exactly
 * correct by construction.
 */

import { mulberry32, normalSampler, type Rng } from "@/lib/math/random";

export type ReturnProcess = "gbm" | "regime" | "jump" | "studentt";

/**
 * Student-t draws via the standard normal / chi-squared construction:
 *
 *   T = Z / sqrt(V / nu),  where Z ~ N(0,1) and V ~ chi-squared with nu degrees of freedom.
 *
 * We build the chi-squared as a sum of nu squared normals, which is exact for
 * integer nu and avoids needing a gamma sampler.
 *
 * The result is then rescaled by sqrt((nu - 2)/nu) so that it has UNIT variance.
 * Without that rescaling, lowering nu would increase the variance at the same
 * time as fattening the tails, and the comparison against the Gaussian case
 * would confound the two effects — exactly the kind of uncontrolled comparison
 * this lab is meant to teach you to avoid. A Student-t has finite variance only
 * for nu > 2, so nu is clamped accordingly.
 */
function studentTSampler(rng: Rng, degreesOfFreedom: number): () => number {
  const nu = Math.max(2.5, Math.round(degreesOfFreedom));
  const normal = normalSampler(rng);
  const scale = Math.sqrt((nu - 2) / nu);
  const n = Math.round(nu);
  return () => {
    const z = normal();
    let chiSquared = 0;
    for (let i = 0; i < n; i++) {
      const g = normal();
      chiSquared += g * g;
    }
    return scale * (z / Math.sqrt(chiSquared / n));
  };
}

export interface ProcessResult {
  returns: number[];
  prices: number[];
  /** Human-readable note on what generated the tails, shown in the UI. */
  tailMechanism: string;
}

/**
 * Generate a daily return series from one of four processes.
 *
 * All four are calibrated to the SAME target annual volatility, so that
 * differences in the risk metrics are attributable to the shape of the
 * distribution rather than to its scale.
 */
export function generateRiskSeries(
  process: ReturnProcess,
  options: {
    drift: number;
    volatility: number;
    steps: number;
    seed: number;
    tailParam: number;
    initialPrice?: number;
    periodsPerYear?: number;
  },
): ProcessResult {
  const { drift, volatility, steps, seed, tailParam } = options;
  const periodsPerYear = options.periodsPerYear ?? 252;
  const initialPrice = options.initialPrice ?? 100;

  const rng = mulberry32(seed);
  const normal = normalSampler(rng);
  const dt = 1 / periodsPerYear;
  const baseDrift = (drift - (volatility * volatility) / 2) * dt;
  const baseSd = volatility * Math.sqrt(dt);

  const logReturnsOut: number[] = [];
  let tailMechanism = "";

  if (process === "gbm") {
    tailMechanism = "None — log returns are exactly normal.";
    for (let i = 0; i < steps; i++) logReturnsOut.push(baseDrift + baseSd * normal());
  } else if (process === "studentt") {
    // tailParam 0 -> nu = 30 (nearly normal); tailParam 1 -> nu = 3 (very heavy).
    const nu = Math.round(30 - 27 * tailParam);
    tailMechanism = `Student-t innovations with ν = ${nu} degrees of freedom, rescaled to unit variance. Lower ν means heavier tails; ν → ∞ recovers the normal.`;
    const t = studentTSampler(rng, nu);
    for (let i = 0; i < steps; i++) logReturnsOut.push(baseDrift + baseSd * t());
  } else if (process === "jump") {
    // Jump intensity scales with tailParam: 0 -> no jumps, 1 -> ~12 per year.
    const jumpsPerYear = 12 * tailParam;
    const jumpMean = -0.03;
    const jumpVol = 0.05;
    const jumpProbability = jumpsPerYear * dt;

    // Jumps contribute their own variance on top of the diffusion. Over a step,
    // the jump component adds approximately
    //   lambda*dt * (jumpMean^2 + jumpVol^2)
    // to the variance. If we left the diffusion at full strength, turning up the
    // jump intensity would raise TOTAL volatility as well as fattening the
    // tails, and any difference in the risk metrics would confound the two.
    // We therefore shrink the diffusion so the total matches the target.
    const targetVariance = baseSd * baseSd;
    const jumpVariance = jumpProbability * (jumpMean * jumpMean + jumpVol * jumpVol);
    const diffusionSd = Math.sqrt(Math.max(targetVariance * 0.05, targetVariance - jumpVariance));

    // Compensate the drift so adding jumps does not change expected growth.
    const compensation = jumpsPerYear * (jumpMean + (jumpVol * jumpVol) / 2) * dt;
    tailMechanism = `Poisson jumps arriving about ${jumpsPerYear.toFixed(1)} times per year, with mean log size ${(jumpMean * 100).toFixed(1)}%. The diffusion is shrunk so total volatility still matches the target, and the drift is compensated so expected growth is unchanged.`;
    for (let i = 0; i < steps; i++) {
      let step = baseDrift - compensation + diffusionSd * normal();
      if (rng() < jumpProbability) step += jumpMean + jumpVol * normal();
      logReturnsOut.push(step);
    }
  } else {
    // Regime switching between a calm and a turbulent state.
    const pCalmToTurbulent = 0.015;
    const pTurbulentToCalm = 0.06;

    // Long-run share of time in each regime. For a two-state chain this has a
    // simple closed form: the stationary probability of a state is proportional
    // to the rate of entering it.
    const shareTurbulent = pCalmToTurbulent / (pCalmToTurbulent + pTurbulentToCalm);
    const shareCalm = 1 - shareTurbulent;

    // Relative volatilities, then a scale factor that makes the MIXTURE variance
    // equal the target. Without this the regime process would be far more
    // volatile overall than the Gaussian one — at tailParam 0.8 it came out at
    // 27% against a 20% target — and the comparison between processes would no
    // longer isolate tail shape from scale.
    const relativeCalm = 1 - 0.5 * tailParam;
    const relativeTurbulent = 1 + 2.2 * tailParam;
    const mixtureScale =
      1 / Math.sqrt(shareCalm * relativeCalm ** 2 + shareTurbulent * relativeTurbulent ** 2);

    const calmVol = volatility * relativeCalm * mixtureScale;
    const turbulentVol = volatility * relativeTurbulent * mixtureScale;

    tailMechanism = `Two volatility regimes: calm at ${(calmVol * 100).toFixed(1)}% and turbulent at ${(turbulentVol * 100).toFixed(1)}%, with the turbulent state occupying about ${(shareTurbulent * 100).toFixed(0)}% of days. Both are rescaled so the blended volatility matches the target. Each regime is normal; the mixture is not.`;

    let turbulent = false;
    for (let i = 0; i < steps; i++) {
      const vol = turbulent ? turbulentVol : calmVol;
      const sd = vol * Math.sqrt(dt);
      logReturnsOut.push((drift - (vol * vol) / 2) * dt + sd * normal());
      // Switch AFTER generating, so the recorded regime produced the return.
      const switchProbability = turbulent ? pTurbulentToCalm : pCalmToTurbulent;
      if (rng() < switchProbability) turbulent = !turbulent;
    }
  }

  // Convert log returns to prices and to simple returns.
  const prices = [initialPrice];
  const simpleReturns: number[] = [];
  for (const logReturn of logReturnsOut) {
    const next = prices[prices.length - 1] * Math.exp(logReturn);
    prices.push(next);
    simpleReturns.push(next / prices[prices.length - 2] - 1);
  }

  return { returns: simpleReturns, prices, tailMechanism };
}
