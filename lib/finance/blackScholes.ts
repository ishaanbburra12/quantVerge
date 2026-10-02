/**
 * Black-Scholes-Merton option pricing and Greeks.
 *
 * The model prices a European option — one that can only be exercised at expiry
 * — under a specific set of assumptions, every one of which is false in some
 * measurable way. It is still the most important formula in derivatives,
 * because it gives a common language (implied volatility) for quoting prices,
 * and because knowing exactly HOW it is wrong is most of what a derivatives
 * desk does.
 */

import { normalCDF, normalPDF, normalInverseCDF } from "@/lib/math/distributions";
import { mulberry32, normalSampler } from "@/lib/math/random";
import { mean, standardDeviation } from "@/lib/statistics/descriptive";

export type OptionType = "call" | "put";

export interface BlackScholesInputs {
  /** Current price of the underlying, S. */
  spot: number;
  /** Strike price, K. */
  strike: number;
  /** Time to expiry in YEARS, T. */
  timeToExpiry: number;
  /** Continuously-compounded annual risk-free rate, r. */
  riskFreeRate: number;
  /** Annualised volatility of the underlying's log returns, sigma. */
  volatility: number;
  /** Continuous dividend yield, q. Defaults to 0. */
  dividendYield?: number;
}

export interface Greeks {
  delta: number;
  gamma: number;
  /** Theta PER DAY (the raw formula gives per-year; we divide by 365). */
  theta: number;
  /** Vega per 1 PERCENTAGE POINT of volatility (raw formula is per 1.0). */
  vega: number;
  /** Rho per 1 PERCENTAGE POINT of rate. */
  rho: number;
}

export interface BlackScholesResult {
  price: number;
  d1: number;
  d2: number;
  greeks: Greeks;
  /** The value if exercised right now, max(S-K, 0) for a call. */
  intrinsicValue: number;
  /** price - intrinsicValue: what you pay for the remaining optionality. */
  timeValue: number;
}

function validate(inputs: BlackScholesInputs): void {
  const { spot, strike, timeToExpiry, volatility } = inputs;
  if (!(spot > 0)) throw new Error("blackScholes: spot must be positive");
  if (!(strike > 0)) throw new Error("blackScholes: strike must be positive");
  if (timeToExpiry < 0) throw new Error("blackScholes: timeToExpiry cannot be negative");
  if (volatility < 0) throw new Error("blackScholes: volatility cannot be negative");
}

/**
 * The two standardised distances that drive everything.
 *
 *   d1 = [ ln(S/K) + (r - q + sigma^2/2) * T ] / (sigma * sqrt(T))
 *   d2 = d1 - sigma * sqrt(T)
 *
 * Both measure "how many standard deviations of log-price is the option
 * in-the-money?", but under two different probability measures, and the
 * distinction is the conceptual heart of the model:
 *
 *   N(d2) is the risk-neutral probability that the option expires in the money.
 *   N(d1) is that same probability REWEIGHTED by the price of the underlying —
 *         formally, the probability under the measure where the stock itself is
 *         the numeraire. It is also exactly the call's delta.
 *
 * The denominator sigma*sqrt(T) is the standard deviation of log-price over the
 * remaining life. As T -> 0 it goes to zero and both d terms blow up to +/-
 * infinity, which is the correct limiting behaviour: the option becomes a
 * certainty one way or the other.
 */
export function blackScholesD(inputs: BlackScholesInputs): { d1: number; d2: number } {
  const { spot, strike, timeToExpiry, riskFreeRate, volatility } = inputs;
  const q = inputs.dividendYield ?? 0;
  const sqrtT = Math.sqrt(timeToExpiry);
  const denominator = volatility * sqrtT;
  if (denominator === 0) {
    // Zero volatility or zero time: the outcome is deterministic. Push d to
    // +/- infinity according to whether the (forward) spot exceeds the strike,
    // which makes the pricing formulas collapse to the discounted intrinsic
    // value rather than returning NaN.
    const forward = spot * Math.exp((riskFreeRate - q) * timeToExpiry);
    const sign = forward >= strike ? Infinity : -Infinity;
    return { d1: sign, d2: sign };
  }
  const d1 =
    (Math.log(spot / strike) + (riskFreeRate - q + (volatility * volatility) / 2) * timeToExpiry) / denominator;
  return { d1, d2: d1 - denominator };
}

/**
 * Price and Greeks for a European option.
 *
 * Call:  C = S*e^(-qT)*N(d1) - K*e^(-rT)*N(d2)
 * Put:   P = K*e^(-rT)*N(-d2) - S*e^(-qT)*N(-d1)
 *
 * Read the call formula as a portfolio: you expect to receive the stock with
 * (reweighted) probability N(d1) and to pay the strike with probability N(d2),
 * with the strike discounted back to today at the risk-free rate.
 *
 * The put formula is not a separate result; it follows from PUT-CALL PARITY,
 *   C - P = S*e^(-qT) - K*e^(-rT),
 * which is a pure no-arbitrage identity — it holds regardless of whether
 * Black-Scholes is the right model at all.
 */
export function blackScholes(inputs: BlackScholesInputs, type: OptionType): BlackScholesResult {
  validate(inputs);
  const { spot, strike, timeToExpiry, riskFreeRate, volatility } = inputs;
  const q = inputs.dividendYield ?? 0;
  const { d1, d2 } = blackScholesD(inputs);

  const discount = Math.exp(-riskFreeRate * timeToExpiry);
  const carry = Math.exp(-q * timeToExpiry);
  const sqrtT = Math.sqrt(timeToExpiry);

  let price: number;
  let delta: number;
  let rho: number;

  if (type === "call") {
    price = spot * carry * normalCDF(d1) - strike * discount * normalCDF(d2);
    delta = carry * normalCDF(d1);
    rho = strike * timeToExpiry * discount * normalCDF(d2);
  } else {
    price = strike * discount * normalCDF(-d2) - spot * carry * normalCDF(-d1);
    delta = -carry * normalCDF(-d1);
    rho = -strike * timeToExpiry * discount * normalCDF(-d2);
  }

  // Gamma and vega are IDENTICAL for calls and puts. That follows directly from
  // put-call parity: the difference between them is linear in S and contains no
  // volatility, so differentiating twice in S (or once in sigma) kills it.
  const pdfD1 = normalPDF(d1);
  const gamma = timeToExpiry > 0 && volatility > 0 ? (carry * pdfD1) / (spot * volatility * sqrtT) : 0;
  const vegaRaw = spot * carry * pdfD1 * sqrtT;

  // Theta: the derivative with respect to CALENDAR time, so it is normally
  // negative for a long option — time decay works against the holder.
  let thetaRaw: number;
  if (timeToExpiry <= 0 || volatility <= 0) {
    thetaRaw = 0;
  } else if (type === "call") {
    thetaRaw =
      (-spot * carry * pdfD1 * volatility) / (2 * sqrtT) +
      q * spot * carry * normalCDF(d1) -
      riskFreeRate * strike * discount * normalCDF(d2);
  } else {
    thetaRaw =
      (-spot * carry * pdfD1 * volatility) / (2 * sqrtT) -
      q * spot * carry * normalCDF(-d1) +
      riskFreeRate * strike * discount * normalCDF(-d2);
  }

  const intrinsicValue = type === "call" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);

  return {
    // Floating-point noise can make a deep out-of-the-money price very slightly
    // negative. An option can never be worth less than nothing.
    price: Math.max(0, price),
    d1,
    d2,
    greeks: {
      delta,
      gamma,
      // Scaled to the units practitioners actually quote.
      theta: thetaRaw / 365,
      vega: vegaRaw / 100,
      rho: rho / 100,
    },
    intrinsicValue,
    timeValue: Math.max(0, price) - intrinsicValue,
  };
}

export function blackScholesCall(inputs: BlackScholesInputs): number {
  return blackScholes(inputs, "call").price;
}

export function blackScholesPut(inputs: BlackScholesInputs): number {
  return blackScholes(inputs, "put").price;
}

/** Check put-call parity numerically. Should be ~0 for a correct implementation. */
export function putCallParityResidual(inputs: BlackScholesInputs): number {
  const c = blackScholesCall(inputs);
  const p = blackScholesPut(inputs);
  const q = inputs.dividendYield ?? 0;
  const lhs = c - p;
  const rhs =
    inputs.spot * Math.exp(-q * inputs.timeToExpiry) -
    inputs.strike * Math.exp(-inputs.riskFreeRate * inputs.timeToExpiry);
  return lhs - rhs;
}

export interface MonteCarloOptionResult {
  price: number;
  /** Standard error of the estimate: sd / sqrt(n). */
  standardError: number;
  /** 95% confidence interval for the true price. */
  confidenceInterval: [number, number];
  simulations: number;
  /** Convergence trace: running estimate at increasing sample sizes. */
  convergence: { simulations: number; price: number; standardError: number }[];
}

/**
 * Monte Carlo option pricing.
 *
 * The logic is the FUNDAMENTAL THEOREM OF ASSET PRICING: the price of a
 * derivative is the expected value of its discounted payoff, taken under the
 * RISK-NEUTRAL measure. "Risk-neutral" means we replace the real-world drift mu
 * with the risk-free rate r. This is not an assumption that investors do not
 * care about risk; it is a change of probability measure that is valid because
 * the option can be hedged with the underlying, so the hedged position must earn
 * r or there is an arbitrage.
 *
 * So: simulate terminal prices under
 *   S_T = S_0 * exp[ (r - q - sigma^2/2) * T + sigma * sqrt(T) * Z ]
 * average the payoffs, and discount by e^(-rT).
 *
 * Note that we simulate the terminal price in ONE step rather than walking the
 * path. For a European option, whose payoff depends only on S_T, that is not an
 * approximation — it is exact, since the log price at T is normal with known
 * mean and variance. Path-stepping is only needed for path-dependent payoffs.
 *
 * CONVERGENCE: the standard error falls as 1/sqrt(n). To cut the error in half
 * you need FOUR times the simulations; for one more decimal digit, a hundred
 * times. This is the central practical limitation of Monte Carlo, and why
 * variance-reduction techniques (such as the antithetic variates used below)
 * matter so much.
 */
export function monteCarloOptionPrice(
  inputs: BlackScholesInputs,
  type: OptionType,
  simulations: number,
  seed: number,
  useAntithetic = true,
): MonteCarloOptionResult {
  validate(inputs);
  if (!Number.isInteger(simulations) || simulations < 2) {
    throw new Error("monteCarloOptionPrice: simulations must be an integer >= 2");
  }
  const { spot, strike, timeToExpiry, riskFreeRate, volatility } = inputs;
  const q = inputs.dividendYield ?? 0;

  const nextNormal = normalSampler(mulberry32(seed));
  const drift = (riskFreeRate - q - (volatility * volatility) / 2) * timeToExpiry;
  const diffusion = volatility * Math.sqrt(timeToExpiry);
  const discount = Math.exp(-riskFreeRate * timeToExpiry);

  const payoff = (s: number) => (type === "call" ? Math.max(0, s - strike) : Math.max(0, strike - s));

  const payoffs: number[] = [];
  // Checkpoints for the convergence chart, logarithmically spaced.
  const checkpoints = new Set<number>();
  for (let p = 1; 10 ** p <= simulations; p++) checkpoints.add(10 ** p);
  for (const frac of [0.25, 0.5, 0.75]) checkpoints.add(Math.max(2, Math.floor(simulations * frac)));
  checkpoints.add(simulations);

  const convergence: MonteCarloOptionResult["convergence"] = [];
  let runningSum = 0;
  let runningSumSquares = 0;

  for (let i = 0; i < simulations; i++) {
    let value: number;
    if (useAntithetic) {
      // ANTITHETIC VARIATES: for each draw Z, also use -Z and average the two
      // payoffs. Because the two are negatively correlated, the variance of
      // their average is lower than the variance of two independent draws, so
      // the estimate converges faster for the same number of random numbers.
      // Each Z therefore contributes one averaged observation, not two.
      const z = nextNormal();
      const up = spot * Math.exp(drift + diffusion * z);
      const down = spot * Math.exp(drift - diffusion * z);
      value = (payoff(up) + payoff(down)) / 2;
    } else {
      value = payoff(spot * Math.exp(drift + diffusion * nextNormal()));
    }
    payoffs.push(value);
    runningSum += value;
    runningSumSquares += value * value;

    const n = i + 1;
    if (checkpoints.has(n)) {
      const m = runningSum / n;
      // Sample variance from running sums, with Bessel's correction.
      const varEst = n > 1 ? Math.max(0, (runningSumSquares - n * m * m) / (n - 1)) : 0;
      convergence.push({
        simulations: n,
        price: discount * m,
        standardError: discount * Math.sqrt(varEst / n),
      });
    }
  }

  const estimate = mean(payoffs);
  const sd = standardDeviation(payoffs, 1);
  const price = discount * estimate;
  const standardError = (discount * sd) / Math.sqrt(simulations);

  return {
    price,
    standardError,
    // A 95% CI uses the normal quantile 1.96, justified by the Central Limit
    // Theorem: the SAMPLE MEAN is approximately normal even though the payoff
    // distribution itself is highly skewed and has a point mass at zero.
    confidenceInterval: [price - 1.96 * standardError, price + 1.96 * standardError],
    simulations,
    convergence: convergence.sort((a, b) => a.simulations - b.simulations),
  };
}

/**
 * Implied volatility by bisection: find the sigma that reproduces an observed
 * market price.
 *
 * Bisection rather than Newton-Raphson, because vega approaches zero for deep
 * in- or out-of-the-money options, and Newton's method divides by vega — it can
 * diverge badly there. Bisection is slower but cannot fail as long as the root
 * is bracketed, which matters more than speed here.
 *
 * It works because the option price is strictly increasing in volatility, so
 * there is exactly one solution.
 */
export function impliedVolatility(
  targetPrice: number,
  inputs: Omit<BlackScholesInputs, "volatility">,
  type: OptionType,
  tolerance = 1e-8,
  maxIterations = 200,
): number | null {
  let lo = 1e-6;
  let hi = 5; // 500% volatility is a generous upper bracket
  const priceAt = (sigma: number) => blackScholes({ ...inputs, volatility: sigma }, type).price;

  if (targetPrice < priceAt(lo) || targetPrice > priceAt(hi)) return null;

  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2;
    const diff = priceAt(mid) - targetPrice;
    if (Math.abs(diff) < tolerance) return mid;
    if (diff > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export { normalCDF, normalPDF, normalInverseCDF };
