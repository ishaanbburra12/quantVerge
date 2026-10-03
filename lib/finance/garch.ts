/**
 * GARCH(1,1): modelling volatility that changes over time.
 *
 * Every model elsewhere on this site assumes constant volatility. That
 * assumption is contradicted by the single most robust empirical fact in
 * finance — volatility clusters. Large moves follow large moves; calm follows
 * calm. The Random Walk lab shows it as autocorrelation in squared returns that
 * is strongly positive even when returns themselves have none.
 *
 * GARCH is the standard answer. It makes today's variance an explicit function
 * of yesterday's surprise and yesterday's variance, which turns volatility from
 * a fixed parameter into a forecastable quantity.
 */

import { mulberry32, normalSampler } from "@/lib/math/random";
import { nelderMead } from "@/lib/math/optimize";
import { mean, standardDeviation } from "@/lib/statistics/descriptive";

export interface GarchParams {
  /** Constant term. Sets the floor on variance. */
  omega: number;
  /** Reaction: weight on the most recent squared shock. */
  alpha: number;
  /** Persistence: weight on the previous variance estimate. */
  beta: number;
  /** Mean return per period. */
  mu: number;
}

/**
 * The unconditional (long-run) variance a GARCH process reverts to.
 *
 *   sigma^2_infinity = omega / (1 - alpha - beta)
 *
 * This only exists when alpha + beta < 1. At alpha + beta = 1 the process is
 * IGARCH: shocks never decay, there is no long-run level, and variance wanders
 * without bound. The sum alpha + beta is therefore the single most informative
 * number in a fitted model — it is the persistence, and on real equity data it
 * is typically around 0.95 to 0.99, meaning volatility shocks take months to
 * fade.
 */
export function longRunVariance(params: GarchParams): number {
  const persistence = params.alpha + params.beta;
  if (persistence >= 1) return Infinity;
  return params.omega / (1 - persistence);
}

/** Half-life of a volatility shock, in periods: ln(0.5) / ln(alpha + beta). */
export function volatilityHalfLife(params: GarchParams): number {
  const persistence = params.alpha + params.beta;
  if (persistence >= 1 || persistence <= 0) return Infinity;
  return Math.log(0.5) / Math.log(persistence);
}

export interface GarchSeries {
  returns: number[];
  /** The conditional variance used to generate each return. */
  variances: number[];
  /** Annualised conditional volatility, for plotting. */
  volatilities: number[];
  prices: number[];
}

/**
 * Simulate a GARCH(1,1) process.
 *
 *   r_t   = mu + eps_t,     eps_t = sigma_t * z_t,   z_t ~ N(0,1)
 *   sigma^2_t = omega + alpha * eps^2_{t-1} + beta * sigma^2_{t-1}
 *
 * Note the ordering: the variance for period t is computed from information
 * available at t-1, so sigma_t is genuinely a FORECAST rather than a
 * contemporaneous description. Getting this backwards would let the model see
 * the shock it is supposed to be predicting.
 *
 * The recursion is seeded at the long-run variance, which is the stationary
 * starting point; starting elsewhere produces a transient that contaminates the
 * early sample.
 */
export function simulateGarch(
  params: GarchParams,
  steps: number,
  seed: number,
  periodsPerYear = 252,
): GarchSeries {
  if (!(params.omega > 0)) throw new Error("simulateGarch: omega must be positive");
  if (params.alpha < 0 || params.beta < 0) throw new Error("simulateGarch: alpha and beta must be non-negative");
  if (!Number.isInteger(steps) || steps < 1) throw new Error("simulateGarch: steps must be a positive integer");

  const normal = normalSampler(mulberry32(seed));
  const stationary = params.alpha + params.beta < 1 ? longRunVariance(params) : params.omega;

  const returns: number[] = [];
  const variances: number[] = [];
  let variance = stationary;
  let previousShock = 0;

  for (let t = 0; t < steps; t++) {
    // Update the variance using the PREVIOUS period's shock, then draw.
    variance = params.omega + params.alpha * previousShock * previousShock + params.beta * variance;
    const shock = Math.sqrt(variance) * normal();
    returns.push(params.mu + shock);
    variances.push(variance);
    previousShock = shock;
  }

  const prices = [100];
  for (const r of returns) prices.push(prices[prices.length - 1] * (1 + r));

  return {
    returns,
    variances,
    volatilities: variances.map((v) => Math.sqrt(v * periodsPerYear)),
    prices,
  };
}

/**
 * Gaussian log-likelihood of a return series under GARCH(1,1).
 *
 *   log L = -0.5 * sum over t of [ log(2*pi) + log(sigma^2_t) + eps^2_t / sigma^2_t ]
 *
 * Read the two variance terms as competing pressures. The log(sigma^2) term
 * penalises claiming high variance; the eps^2/sigma^2 term penalises claiming
 * low variance when a large move occurs. The maximum sits where the model's
 * variance forecasts are honest.
 *
 * Returns -Infinity for parameters that make variance non-positive, so the
 * optimiser treats the inadmissible region as infinitely bad rather than
 * producing NaN.
 */
export function garchLogLikelihood(returns: number[], params: GarchParams): number {
  if (params.omega <= 0 || params.alpha < 0 || params.beta < 0) return -Infinity;
  if (params.alpha + params.beta >= 1) return -Infinity;

  // Initialise at the sample variance, the standard choice.
  let variance = Math.max(1e-12, standardDeviation(returns, 1) ** 2);
  let logLikelihood = 0;
  let previousShock = 0;

  for (let t = 0; t < returns.length; t++) {
    variance = params.omega + params.alpha * previousShock * previousShock + params.beta * variance;
    if (!(variance > 0) || !Number.isFinite(variance)) return -Infinity;
    const shock = returns[t] - params.mu;
    logLikelihood += -0.5 * (Math.log(2 * Math.PI) + Math.log(variance) + (shock * shock) / variance);
    previousShock = shock;
  }
  return logLikelihood;
}

export interface GarchFit {
  params: GarchParams;
  logLikelihood: number;
  persistence: number;
  longRunVolatility: number;
  halfLife: number;
  converged: boolean;
  iterations: number;
  /** Akaike and Bayesian information criteria, for comparing models. */
  aic: number;
  bic: number;
}

/**
 * Fit GARCH(1,1) by maximum likelihood.
 *
 * The parameters are constrained — omega > 0, alpha, beta >= 0, alpha + beta < 1
 * — and Nelder-Mead is unconstrained, so we optimise in a TRANSFORMED space
 * where every real vector maps to an admissible parameter set:
 *
 *   omega = exp(theta_0)                      keeps it positive
 *   alpha = s * logistic(theta_1)             keeps the pair inside the simplex
 *   beta  = s * (1 - logistic(theta_1)) ...   with s = 0.999 * logistic(theta_2)
 *
 * This is cleaner than penalising violations, which leaves the optimiser
 * wandering into regions where the likelihood is undefined.
 */
export function fitGarch(returns: number[], periodsPerYear = 252): GarchFit {
  if (returns.length < 50) throw new Error("fitGarch: need at least 50 observations");

  const sampleMean = mean(returns);
  const sampleVariance = standardDeviation(returns, 1) ** 2;
  const logistic = (x: number) => 1 / (1 + Math.exp(-x));

  const toParams = (theta: number[]): GarchParams => {
    // Total persistence, capped just below 1 to stay stationary.
    const persistence = 0.999 * logistic(theta[2]);
    // How that persistence splits between reaction and memory.
    const alphaShare = logistic(theta[1]);
    return {
      omega: Math.exp(theta[0]),
      alpha: persistence * alphaShare,
      beta: persistence * (1 - alphaShare),
      mu: sampleMean,
    };
  };

  // Start from a typical equity calibration: high persistence, most of it in
  // beta. Starting from a flat guess often lands the simplex on a plateau.
  const start = [
    Math.log(Math.max(1e-12, sampleVariance * 0.05)),
    Math.log(0.1 / 0.9), // alpha share around 0.1
    Math.log(0.95 / 0.05), // persistence around 0.95
  ];

  const result = nelderMead((theta) => -garchLogLikelihood(returns, toParams(theta)), start, {
    scale: [1.5, 1.0, 1.0],
    maxIterations: 4000,
    tolerance: 1e-12,
  });

  const params = toParams(result.x);
  const logLikelihood = garchLogLikelihood(returns, params);
  const persistence = params.alpha + params.beta;
  const k = 3; // omega, alpha, beta
  const n = returns.length;

  return {
    params,
    logLikelihood,
    persistence,
    longRunVolatility: Math.sqrt(longRunVariance(params) * periodsPerYear),
    halfLife: volatilityHalfLife(params),
    converged: result.converged,
    iterations: result.iterations,
    aic: 2 * k - 2 * logLikelihood,
    bic: k * Math.log(n) - 2 * logLikelihood,
  };
}

/**
 * Filter a return series to recover the conditional variance path implied by a
 * parameter set. This is what turns a fitted model into a usable volatility
 * estimate for each historical day.
 */
export function garchFilter(returns: number[], params: GarchParams, periodsPerYear = 252): number[] {
  let variance = Math.max(1e-12, standardDeviation(returns, 1) ** 2);
  let previousShock = 0;
  const out: number[] = [];
  for (const r of returns) {
    variance = params.omega + params.alpha * previousShock * previousShock + params.beta * variance;
    out.push(Math.sqrt(variance * periodsPerYear));
    previousShock = r - params.mu;
  }
  return out;
}

/**
 * Forecast variance h periods ahead.
 *
 *   E[sigma^2_{t+h}] = sigma^2_inf + (alpha + beta)^(h-1) * (sigma^2_{t+1} - sigma^2_inf)
 *
 * The forecast decays geometrically from today's level toward the long-run
 * variance at rate (alpha + beta). That is the practically useful output of a
 * GARCH model: not a return forecast, but a statement about how long current
 * conditions will persist.
 */
export function forecastVariance(
  params: GarchParams,
  currentVariance: number,
  horizon: number,
  periodsPerYear = 252,
): { horizon: number; variance: number; annualisedVolatility: number }[] {
  const persistence = params.alpha + params.beta;
  const longRun = persistence < 1 ? longRunVariance(params) : currentVariance;
  const out: { horizon: number; variance: number; annualisedVolatility: number }[] = [];

  for (let h = 1; h <= horizon; h++) {
    const variance = longRun + persistence ** (h - 1) * (currentVariance - longRun);
    out.push({ horizon: h, variance, annualisedVolatility: Math.sqrt(variance * periodsPerYear) });
  }
  return out;
}
