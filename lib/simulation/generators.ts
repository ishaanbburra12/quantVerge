/**
 * Synthetic data generators.
 *
 * Every lab in QuantLab runs on synthetic data by design, not as a shortcut.
 * With synthetic data you KNOW the true data-generating process, so you can ask
 * the question that real data can never answer: does my estimator actually
 * recover the truth? If a method cannot detect momentum in a series you built
 * to have momentum, it will certainly not find it in the market.
 *
 * Every generator takes an explicit seed and is fully deterministic.
 */

import { mulberry32, normalSampler, sampleDiscrete, type Rng } from "@/lib/math/random";

export const TRADING_DAYS_PER_YEAR = 252;

export interface GbmParams {
  /** Starting price S0. Must be positive. */
  initialPrice: number;
  /** Expected annual drift mu, as a decimal (0.08 = 8%). */
  drift: number;
  /** Annual volatility sigma, as a decimal (0.2 = 20%). Must be >= 0. */
  volatility: number;
  /** Number of time steps to simulate. */
  steps: number;
  /** Time horizon in years. 1 = one year. */
  horizonYears: number;
  seed: number;
}

/**
 * Geometric Brownian motion.
 *
 * The continuous-time stochastic differential equation is
 *
 *   dS = mu * S * dt + sigma * S * dW
 *
 * which says the instantaneous change in price has a predictable part
 * proportional to the current price (drift) and a random part also proportional
 * to the current price (diffusion), where dW is an increment of a Wiener
 * process. Scaling both by S is what makes the model multiplicative: a stock at
 * $500 moves in bigger dollar steps than one at $5, but in the same PERCENTAGE
 * steps. It is also what keeps the price strictly positive.
 *
 * Simulating that SDE naively (S + mu*S*dt + sigma*S*sqrt(dt)*Z) introduces
 * discretisation error and can even produce negative prices. Instead we use the
 * EXACT solution, obtained by applying Ito's lemma to ln(S):
 *
 *   S(t + dt) = S(t) * exp[ (mu - sigma^2 / 2) * dt + sigma * sqrt(dt) * Z ]
 *
 * with Z ~ N(0, 1) drawn independently at each step.
 *
 * The -sigma^2/2 term is the one students almost always ask about. It is the
 * Ito correction, and it is not a fudge factor. The exponential function is
 * convex, so E[exp(X)] > exp(E[X]): if you exponentiate a zero-mean random
 * variable you get something with a mean ABOVE 1. Without subtracting
 * sigma^2/2, volatility alone would manufacture free expected growth, and the
 * realised average return would exceed the mu you asked for. With it,
 * E[S(t)] = S0 * exp(mu * t) exactly, so mu means what it says.
 *
 * A direct consequence: the MEDIAN path grows at (mu - sigma^2/2) while the
 * MEAN grows at mu. For sigma = 0.4, that gap is 8% per year. The mean is
 * dragged up by a thin tail of enormous outcomes that the typical path never
 * sees. This is the mathematics behind "volatility drag".
 */
export function generateGBM(params: GbmParams): number[] {
  const { initialPrice, drift, volatility, steps, horizonYears, seed } = params;
  if (!(initialPrice > 0)) throw new Error("generateGBM: initialPrice must be positive");
  if (!(volatility >= 0)) throw new Error("generateGBM: volatility must be non-negative");
  if (!Number.isInteger(steps) || steps < 1) throw new Error("generateGBM: steps must be a positive integer");
  if (!(horizonYears > 0)) throw new Error("generateGBM: horizonYears must be positive");

  const dt = horizonYears / steps;
  const nextNormal = normalSampler(mulberry32(seed));
  // Precompute both constants; they do not change between steps.
  const driftTerm = (drift - (volatility * volatility) / 2) * dt;
  const diffusionScale = volatility * Math.sqrt(dt);

  const path = new Array<number>(steps + 1);
  path[0] = initialPrice;
  for (let i = 1; i <= steps; i++) {
    path[i] = path[i - 1] * Math.exp(driftTerm + diffusionScale * nextNormal());
  }
  return path;
}

/**
 * Many independent GBM paths. Each path gets its own derived seed so that the
 * set is reproducible AND the paths are independent of one another.
 *
 * The derived seeds are spaced by a large odd constant rather than by 1. Seeding
 * a small-state generator with 1, 2, 3, ... can leave the first few draws of
 * adjacent streams visibly correlated; spacing them widely avoids that.
 */
export function generateGBMPaths(params: GbmParams, pathCount: number): number[][] {
  if (!Number.isInteger(pathCount) || pathCount < 1) {
    throw new Error("generateGBMPaths: pathCount must be a positive integer");
  }
  const paths: number[][] = [];
  for (let i = 0; i < pathCount; i++) {
    paths.push(generateGBM({ ...params, seed: (params.seed + i * 2654435761) >>> 0 }));
  }
  return paths;
}

/**
 * Memory-efficient variant: simulate many paths but keep only the ending prices
 * and per-path summary statistics.
 *
 * Storing 100,000 paths of 252 steps would mean 25 million numbers (~200 MB as
 * float64) and would freeze the browser. Since the distribution of ENDING
 * prices is what most Monte Carlo questions are about, we stream each path and
 * discard it, retaining only the scalars we need.
 */
export interface TerminalStats {
  endingPrices: number[];
  maxDrawdowns: number[];
  minPrices: number[];
  maxPrices: number[];
}

export function simulateTerminalStats(params: GbmParams, pathCount: number): TerminalStats {
  const endingPrices = new Array<number>(pathCount);
  const maxDrawdowns = new Array<number>(pathCount);
  const minPrices = new Array<number>(pathCount);
  const maxPrices = new Array<number>(pathCount);

  const dt = params.horizonYears / params.steps;
  const driftTerm = (params.drift - (params.volatility * params.volatility) / 2) * dt;
  const diffusionScale = params.volatility * Math.sqrt(dt);

  for (let p = 0; p < pathCount; p++) {
    const nextNormal = normalSampler(mulberry32((params.seed + p * 2654435761) >>> 0));
    let price = params.initialPrice;
    let peak = price;
    let worstDd = 0;
    let lo = price;
    let hi = price;
    for (let i = 0; i < params.steps; i++) {
      price = price * Math.exp(driftTerm + diffusionScale * nextNormal());
      if (price > peak) peak = price;
      if (price < lo) lo = price;
      if (price > hi) hi = price;
      const dd = (price - peak) / peak;
      if (dd < worstDd) worstDd = dd;
    }
    endingPrices[p] = price;
    maxDrawdowns[p] = Math.abs(worstDd);
    minPrices[p] = lo;
    maxPrices[p] = hi;
  }
  return { endingPrices, maxDrawdowns, minPrices, maxPrices };
}

/**
 * AR(1): a first-order autoregressive process on RETURNS.
 *
 *   r_t = c + phi * r_{t-1} + epsilon_t,   epsilon_t ~ N(0, sigma_e^2)
 *
 * `phi` is the memory parameter and it is the whole point of this generator:
 *   phi > 0  -> momentum. A positive return raises the expected next return,
 *               so moves extend into trends.
 *   phi < 0  -> mean reversion. A positive return lowers the expected next
 *               return, so moves get partially given back; the price path looks
 *               jagged and range-bound.
 *   phi = 0  -> a pure random walk in prices. No linear memory whatsoever.
 *
 * STATIONARITY requires |phi| < 1. At |phi| >= 1 shocks never decay, the
 * variance grows without bound, and the series has no long-run mean to revert
 * to; we reject that rather than silently producing a divergent series.
 *
 * The unconditional variance of a stationary AR(1) is sigma_e^2 / (1 - phi^2),
 * which is LARGER than the shock variance for any non-zero phi. To let the user
 * set phi and the resulting volatility independently, we scale the innovations
 * by sqrt(1 - phi^2) so the output always has the target standard deviation.
 * Without that rescaling, raising phi would quietly raise volatility too, and
 * any comparison between momentum settings would confound the two effects.
 */
export interface Ar1Params {
  /** Target annual drift of the series. */
  drift: number;
  /** Target annual volatility of the series. */
  volatility: number;
  /** Autocorrelation coefficient phi, strictly within (-1, 1). */
  phi: number;
  steps: number;
  seed: number;
  periodsPerYear?: number;
}

export function generateAR1(params: Ar1Params): number[] {
  const { drift, volatility, phi, steps, seed } = params;
  const periodsPerYear = params.periodsPerYear ?? TRADING_DAYS_PER_YEAR;
  if (!(Math.abs(phi) < 1)) {
    throw new Error("generateAR1: |phi| must be < 1 for a stationary process");
  }
  if (!Number.isInteger(steps) || steps < 1) throw new Error("generateAR1: steps must be a positive integer");

  const nextNormal = normalSampler(mulberry32(seed));
  const periodMean = drift / periodsPerYear;
  const periodSd = volatility / Math.sqrt(periodsPerYear);
  // Rescale innovations so the realised variance matches the target.
  const shockSd = periodSd * Math.sqrt(1 - phi * phi);

  const rets = new Array<number>(steps);
  // Start the deviation at 0, which is the unconditional mean of the process.
  let deviation = 0;
  for (let i = 0; i < steps; i++) {
    deviation = phi * deviation + shockSd * nextNormal();
    rets[i] = periodMean + deviation;
  }
  return rets;
}

/**
 * Ornstein-Uhlenbeck process on the PRICE LEVEL (not on returns).
 *
 *   dX = theta * (mu - X) * dt + sigma * dW
 *
 * The drift term pulls X back toward mu with a force proportional to how far
 * away it is; `theta` is the speed of that pull. This is the canonical model for
 * a genuinely mean-reverting quantity — a spread between two related assets,
 * for instance — as opposed to a price level, which has no natural anchor.
 *
 * The half-life of a deviation is ln(2) / theta, which is the single most
 * useful way to think about theta.
 */
export interface OrnsteinUhlenbeckParams {
  initialValue: number;
  longRunMean: number;
  /** Speed of mean reversion, per year. */
  theta: number;
  /** Annualised volatility of the level (absolute, not percentage). */
  sigma: number;
  steps: number;
  horizonYears: number;
  seed: number;
}

export function generateOrnsteinUhlenbeck(params: OrnsteinUhlenbeckParams): number[] {
  const { initialValue, longRunMean, theta, sigma, steps, horizonYears, seed } = params;
  if (!(theta >= 0)) throw new Error("generateOrnsteinUhlenbeck: theta must be non-negative");
  const dt = horizonYears / steps;
  const nextNormal = normalSampler(mulberry32(seed));
  const out = new Array<number>(steps + 1);
  out[0] = initialValue;
  // Exact discretisation of the OU process: the conditional distribution is
  // normal with a known mean and variance, so we can step exactly rather than
  // approximating with Euler-Maruyama.
  const decay = Math.exp(-theta * dt);
  const condSd = theta > 0 ? sigma * Math.sqrt((1 - decay * decay) / (2 * theta)) : sigma * Math.sqrt(dt);
  for (let i = 1; i <= steps; i++) {
    out[i] = longRunMean + (out[i - 1] - longRunMean) * decay + condSd * nextNormal();
  }
  return out;
}

/**
 * Merton jump-diffusion: GBM plus occasional discontinuous jumps.
 *
 *   dS/S = (mu - lambda*k) dt + sigma dW + (J - 1) dN
 *
 * where dN is a Poisson arrival with intensity lambda and J is the jump
 * multiplier. This generator exists to make a specific point: GBM's tails are
 * too thin. Adding jumps produces the fat tails and sudden gaps that real
 * markets show and that continuous models structurally cannot.
 *
 * Over a short step dt, the probability of a jump is approximately lambda*dt;
 * we draw at most one jump per step, which is accurate when lambda*dt is small.
 */
export interface JumpDiffusionParams extends GbmParams {
  /** Expected number of jumps per year. */
  jumpIntensity: number;
  /** Mean of the log jump size. Negative for crash-biased jumps. */
  jumpMean: number;
  /** Standard deviation of the log jump size. */
  jumpVolatility: number;
}

export function generateJumpDiffusion(params: JumpDiffusionParams): number[] {
  const { initialPrice, drift, volatility, steps, horizonYears, seed, jumpIntensity, jumpMean, jumpVolatility } = params;
  const dt = horizonYears / steps;
  const rng = mulberry32(seed);
  const nextNormal = normalSampler(rng);
  // Compensate the drift so that adding jumps does not also change the overall
  // expected growth rate. The expected log contribution of jumps per unit time
  // is lambda * (jumpMean + jumpVol^2 / 2).
  const jumpCompensation = jumpIntensity * (jumpMean + (jumpVolatility * jumpVolatility) / 2);
  const driftTerm = (drift - jumpCompensation - (volatility * volatility) / 2) * dt;
  const diffusionScale = volatility * Math.sqrt(dt);
  const jumpProbability = jumpIntensity * dt;

  const path = new Array<number>(steps + 1);
  path[0] = initialPrice;
  for (let i = 1; i <= steps; i++) {
    let logStep = driftTerm + diffusionScale * nextNormal();
    if (rng() < jumpProbability) {
      logStep += jumpMean + jumpVolatility * nextNormal();
    }
    path[i] = path[i - 1] * Math.exp(logStep);
  }
  return path;
}

/* ------------------------------------------------------------------ */
/* Regime switching                                                    */
/* ------------------------------------------------------------------ */

export interface Regime {
  name: string;
  /** Annualised drift while in this regime. */
  drift: number;
  /** Annualised volatility while in this regime. */
  volatility: number;
  color: string;
}

export interface RegimeMarketParams {
  regimes: Regime[];
  /**
   * Row-stochastic transition matrix. `transition[i][j]` is P(next = j | current = i).
   * Each row must sum to 1.
   */
  transition: number[][];
  steps: number;
  seed: number;
  initialRegime?: number;
  initialPrice?: number;
  periodsPerYear?: number;
}

export interface RegimeMarketResult {
  prices: number[];
  returns: number[];
  /** The true hidden regime index at each step. Length matches `returns`. */
  regimes: number[];
  /** Fraction of steps spent in each regime. */
  occupancy: number[];
}

/**
 * A Markov-switching market.
 *
 * The market is in one of several hidden states ("regimes"), each with its own
 * drift and volatility. At every step the state may change according to a
 * transition matrix P, where P[i][j] = P(next = j | current = i). The defining
 * MARKOV PROPERTY is that the next state depends only on the current state and
 * not on any earlier history — the state variable contains everything that
 * matters about the past.
 *
 * Two facts make this generator the most useful one here:
 *
 * 1. The diagonal entries P[i][i] control PERSISTENCE. If P[bull][bull] = 0.98,
 *    the expected length of a bull run is 1 / (1 - 0.98) = 50 steps, because the
 *    run length is geometrically distributed. Persistence is what makes a regime
 *    detectable at all: with P[i][i] = 0.5 the state changes so often that no
 *    estimator could track it from noisy returns.
 *
 * 2. The returns this produces are UNCONDITIONALLY non-normal even though they
 *    are conditionally normal within each regime. Mixing normals with different
 *    variances creates fat tails and volatility clustering — two of the most
 *    prominent features of real markets — from entirely Gaussian ingredients.
 */
export function generateRegimeMarket(params: RegimeMarketParams): RegimeMarketResult {
  const { regimes, transition, steps, seed } = params;
  const periodsPerYear = params.periodsPerYear ?? TRADING_DAYS_PER_YEAR;
  const initialPrice = params.initialPrice ?? 100;

  validateTransitionMatrix(transition, regimes.length);
  if (!Number.isInteger(steps) || steps < 1) throw new Error("generateRegimeMarket: steps must be a positive integer");

  const rng: Rng = mulberry32(seed);
  const nextNormal = normalSampler(rng);

  let state = params.initialRegime ?? 0;
  if (state < 0 || state >= regimes.length) throw new Error("generateRegimeMarket: initialRegime out of range");

  const prices: number[] = [initialPrice];
  const rets: number[] = [];
  const states: number[] = [];
  const occupancyCounts = new Array(regimes.length).fill(0);

  for (let i = 0; i < steps; i++) {
    const regime = regimes[state];
    // Convert the regime's annual parameters to this step's parameters, using
    // the same Ito-corrected log-return form as GBM.
    const dt = 1 / periodsPerYear;
    const mu = (regime.drift - (regime.volatility * regime.volatility) / 2) * dt;
    const sd = regime.volatility * Math.sqrt(dt);
    const logReturn = mu + sd * nextNormal();
    const price = prices[prices.length - 1] * Math.exp(logReturn);
    prices.push(price);
    rets.push(price / prices[prices.length - 2] - 1);
    states.push(state);
    occupancyCounts[state] += 1;
    // Transition AFTER generating this step's return, so the recorded state is
    // the state that actually produced the return. Getting this backwards is a
    // subtle off-by-one that makes regimes look one step ahead of the data.
    state = sampleDiscrete(transition[state], rng);
  }

  return {
    prices,
    returns: rets,
    regimes: states,
    occupancy: occupancyCounts.map((c) => c / steps),
  };
}

export function validateTransitionMatrix(transition: number[][], expectedSize: number): void {
  if (transition.length !== expectedSize) {
    throw new Error(`transition matrix must have ${expectedSize} rows`);
  }
  for (let i = 0; i < transition.length; i++) {
    const row = transition[i];
    if (row.length !== expectedSize) {
      throw new Error(`transition matrix row ${i} must have ${expectedSize} entries`);
    }
    let sum = 0;
    for (const p of row) {
      if (p < 0 || p > 1 || !Number.isFinite(p)) {
        throw new Error(`transition matrix entry at row ${i} must be a probability in [0, 1]`);
      }
      sum += p;
    }
    // Allow a small tolerance so that UI sliders producing 0.333/0.333/0.334
    // are accepted.
    if (Math.abs(sum - 1) > 1e-6) {
      throw new Error(`transition matrix row ${i} must sum to 1 (got ${sum.toFixed(6)})`);
    }
  }
}

/**
 * Normalise a row so it sums to exactly 1. Used by the UI after a user drags a
 * single transition slider, so the matrix stays valid at all times.
 */
export function normaliseRow(row: number[]): number[] {
  const total = row.reduce((a, b) => a + b, 0);
  if (total <= 0) return row.map(() => 1 / row.length);
  return row.map((p) => p / total);
}

/**
 * The stationary distribution of a Markov chain: the long-run fraction of time
 * spent in each state, found by iterating the chain forward until the
 * distribution stops changing (the power method).
 *
 * It satisfies pi = pi * P. For an irreducible, aperiodic chain it is unique and
 * is reached from any starting distribution. Comparing it to the OBSERVED
 * occupancy in a finite simulation is a good reality check on how much of the
 * chain's behaviour a short sample actually reveals.
 */
export function stationaryDistribution(transition: number[][], iterations = 2000): number[] {
  const n = transition.length;
  let dist = new Array(n).fill(1 / n);
  for (let iter = 0; iter < iterations; iter++) {
    const next = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) next[j] += dist[i] * transition[i][j];
    }
    let delta = 0;
    for (let i = 0; i < n; i++) delta += Math.abs(next[i] - dist[i]);
    dist = next;
    if (delta < 1e-14) break;
  }
  return dist;
}

/** Expected run length in a state: 1 / (1 - P[i][i]), geometrically distributed. */
export function expectedRegimeDuration(selfTransition: number[][], state: number): number {
  const p = selfTransition[state][state];
  if (p >= 1) return Infinity;
  return 1 / (1 - p);
}

export const DEFAULT_REGIMES: Regime[] = [
  { name: "Bull", drift: 0.14, volatility: 0.13, color: "var(--regime-bull)" },
  { name: "Bear", drift: -0.18, volatility: 0.34, color: "var(--regime-bear)" },
  { name: "Sideways", drift: 0.01, volatility: 0.09, color: "var(--regime-sideways)" },
];

/** A reasonable default: regimes are persistent, bear markets are shortest. */
export const DEFAULT_TRANSITION: number[][] = [
  [0.97, 0.01, 0.02],
  [0.04, 0.93, 0.03],
  [0.03, 0.02, 0.95],
];
