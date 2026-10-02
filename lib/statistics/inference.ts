/**
 * Statistical inference: hypothesis testing, p-values, power and multiple testing.
 *
 * This is the machinery for answering "could this have happened by chance?",
 * which is the question underneath every empirical claim in finance. It is also
 * the most widely misused apparatus in science, so the implementations here are
 * paired with the specific misreadings they invite.
 */

import { logGamma, normalCDF, normalInverseCDF } from "@/lib/math/distributions";
import { mean, standardDeviation } from "@/lib/statistics/descriptive";

/**
 * Regularised incomplete beta function I_x(a, b), by continued fraction.
 *
 * This is the workhorse behind the Student-t CDF. The continued fraction
 * (Lentz's algorithm) converges rapidly for x < (a+1)/(a+b+2); outside that
 * range we use the symmetry I_x(a,b) = 1 - I_{1-x}(b,a), which moves the
 * argument back into the fast-converging region.
 */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const logBeta = logGamma(a + b) - logGamma(a) - logGamma(b);
  const front = Math.exp(logBeta + a * Math.log(x) + b * Math.log(1 - x));

  // Use the symmetry relation where the continued fraction converges slowly.
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - incompleteBeta(1 - x, b, a);
  }

  // Lentz's algorithm for the continued fraction.
  const tiny = 1e-30;
  let f = 1;
  let c = 1;
  let d = 0;

  for (let i = 0; i <= 300; i++) {
    const m = Math.floor(i / 2);
    let numerator: number;
    if (i === 0) {
      numerator = 1;
    } else if (i % 2 === 0) {
      numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    } else {
      numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    }

    d = 1 + numerator * d;
    if (Math.abs(d) < tiny) d = tiny;
    d = 1 / d;

    c = 1 + numerator / c;
    if (Math.abs(c) < tiny) c = tiny;

    const delta = c * d;
    f *= delta;

    if (Math.abs(1 - delta) < 1e-14) break;
  }

  return (front * (f - 1)) / a;
}

/**
 * CDF of Student's t-distribution with nu degrees of freedom.
 *
 * Expressed through the incomplete beta function:
 *   P(T <= t) = 1 - (1/2) I_{nu/(nu+t^2)}(nu/2, 1/2)   for t > 0
 *
 * The t-distribution rather than the normal is correct whenever the standard
 * deviation is ESTIMATED from the same sample — which it always is in practice.
 * Its heavier tails are precisely the penalty for that extra uncertainty, and
 * they matter most at exactly the small sample sizes where people reach for a
 * z-test out of habit.
 */
export function studentTCDF(t: number, nu: number): number {
  if (!(nu > 0)) throw new Error("studentTCDF: degrees of freedom must be positive");
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;

  // Near zero the incomplete-beta route silently loses all resolution. The
  // argument is x = nu/(nu + t^2), and for |t| below about 1e-8 that expression
  // rounds to exactly 1.0 in float64, so I_x returns exactly 1 and the CDF
  // returns exactly 0.5 for EVERY sufficiently small t. The function flattens
  // into a step, which is invisible in normal use but makes any root-finder
  // inverting it stall around 1e-8.
  //
  // The first-order expansion about zero is exact to O(t^3) and perfectly
  // conditioned, so we use it in the region where the other branch degenerates.
  //   F(t) = 1/2 + t * f(0) + O(t^3),  f(0) = Gamma((nu+1)/2) / (sqrt(nu*pi) Gamma(nu/2))
  if (Math.abs(t) < 1e-4) {
    const densityAtZero =
      Math.exp(logGamma((nu + 1) / 2) - logGamma(nu / 2)) / Math.sqrt(nu * Math.PI);
    return 0.5 + t * densityAtZero;
  }

  const x = nu / (nu + t * t);
  const tail = 0.5 * incompleteBeta(x, nu / 2, 0.5);
  return t > 0 ? 1 - tail : tail;
}

/** Inverse t CDF by bisection. Monotone, so bisection cannot fail. */
export function studentTInverse(p: number, nu: number): number {
  if (!(p > 0 && p < 1)) throw new Error("studentTInverse: p must be strictly between 0 and 1");
  let lo = -200;
  let hi = 200;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    if (studentTCDF(mid, nu) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  return (lo + hi) / 2;
}

export type Tail = "two-sided" | "greater" | "less";

export interface TestResult {
  statistic: number;
  pValue: number;
  degreesOfFreedom: number;
  /** Confidence interval for the mean, at the given level. */
  confidenceInterval: [number, number];
  standardError: number;
  sampleMean: number;
  sampleSize: number;
  rejectAtAlpha: boolean;
}

/**
 * One-sample t-test: is the population mean different from `nullMean`?
 *
 *   t = (xbar - mu_0) / (s / sqrt(n)),   with n - 1 degrees of freedom
 *
 * The denominator is the STANDARD ERROR of the mean — how much the sample mean
 * itself would vary across repeated samples — not the standard deviation of the
 * data. Confusing the two is the single most common error in applied statistics,
 * and it produces p-values that are wrong by a factor of sqrt(n).
 */
export function oneSampleTTest(
  sample: number[],
  nullMean = 0,
  alpha = 0.05,
  tail: Tail = "two-sided",
): TestResult {
  const n = sample.length;
  if (n < 2) throw new Error("oneSampleTTest: need at least two observations");

  const xbar = mean(sample);
  const s = standardDeviation(sample, 1);
  const df = n - 1;
  const standardError = s / Math.sqrt(n);

  // A zero standard error means every observation is identical; the test is
  // degenerate rather than infinitely significant.
  if (standardError === 0) {
    return {
      statistic: 0, pValue: 1, degreesOfFreedom: df,
      confidenceInterval: [xbar, xbar], standardError: 0,
      sampleMean: xbar, sampleSize: n, rejectAtAlpha: false,
    };
  }

  const t = (xbar - nullMean) / standardError;

  let pValue: number;
  if (tail === "two-sided") pValue = 2 * (1 - studentTCDF(Math.abs(t), df));
  else if (tail === "greater") pValue = 1 - studentTCDF(t, df);
  else pValue = studentTCDF(t, df);

  const critical = studentTInverse(1 - alpha / 2, df);
  return {
    statistic: t,
    pValue: Math.min(1, Math.max(0, pValue)),
    degreesOfFreedom: df,
    confidenceInterval: [xbar - critical * standardError, xbar + critical * standardError],
    standardError,
    sampleMean: xbar,
    sampleSize: n,
    rejectAtAlpha: pValue < alpha,
  };
}

/**
 * Statistical power: the probability of correctly rejecting a false null.
 *
 * Power = P(reject H0 | the true effect is `effectSize` standard errors away).
 * Using the normal approximation, which is accurate for anything but very small
 * samples:
 *
 *   power = Phi(delta - z_{1-alpha/2}) + Phi(-delta - z_{1-alpha/2})
 *
 * where delta = effect / standard error.
 *
 * Power is the quantity nobody computes and everybody needs. An underpowered
 * study that returns "not significant" has learned nothing — it could not have
 * detected the effect even if it were there. In finance this is the normal
 * situation rather than the exception: detecting a Sharpe of 0.5 at 80% power
 * takes roughly 30 years of data.
 */
export function power(effectSize: number, standardError: number, alpha = 0.05): number {
  if (standardError <= 0) return 1;
  const delta = effectSize / standardError;
  const critical = normalInverseCDF(1 - alpha / 2);
  // Both rejection regions contribute; the far-tail term is negligible unless
  // the effect is tiny, but including it keeps the function exact at delta = 0,
  // where power must equal alpha.
  return normalCDF(delta - critical) + normalCDF(-delta - critical);
}

/** Sample size needed to reach a target power for a given effect. */
export function requiredSampleSize(
  effectSize: number,
  populationSd: number,
  targetPower = 0.8,
  alpha = 0.05,
): number {
  if (effectSize === 0) return Infinity;
  const zAlpha = normalInverseCDF(1 - alpha / 2);
  const zBeta = normalInverseCDF(targetPower);
  return Math.ceil(((zAlpha + zBeta) ** 2 * populationSd ** 2) / effectSize ** 2);
}

/**
 * Bonferroni correction: test each of m hypotheses at alpha/m.
 *
 * Controls the FAMILY-WISE ERROR RATE — the probability of making even one false
 * rejection across the whole family. It is exact and makes no assumptions, which
 * also makes it severe: with 100 tests, a result needs p < 0.0005 to survive.
 */
export function bonferroni(pValues: number[], alpha = 0.05): boolean[] {
  const threshold = alpha / pValues.length;
  return pValues.map((p) => p < threshold);
}

/**
 * Benjamini-Hochberg: control the FALSE DISCOVERY RATE instead.
 *
 * Rather than preventing any false positive, it limits the expected PROPORTION
 * of rejections that are false. Sort the p-values ascending and find the largest
 * k with p_(k) <= (k/m) * alpha; reject the k smallest.
 *
 * This is far less severe than Bonferroni and is usually the right trade when
 * you are screening many candidates and can tolerate some false leads — which
 * describes most quantitative research.
 */
export function benjaminiHochberg(pValues: number[], alpha = 0.05): boolean[] {
  const m = pValues.length;
  const indexed = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);

  let largestK = -1;
  for (let k = 0; k < m; k++) {
    if (indexed[k].p <= ((k + 1) / m) * alpha) largestK = k;
  }

  const rejected = new Array<boolean>(m).fill(false);
  // Everything up to and including the largest passing rank is rejected, even
  // if some of those individual p-values exceed their own threshold.
  for (let k = 0; k <= largestK; k++) rejected[indexed[k].i] = true;
  return rejected;
}

/**
 * Probability that at least one of m independent tests of a TRUE null produces
 * a false positive: 1 - (1 - alpha)^m.
 *
 * At alpha = 0.05 and m = 20 this is 64%. At m = 100 it is 99.4%. This single
 * number explains most of the replication crisis, and it is the same mechanism
 * the Overfitting Lab demonstrates with strategy parameters.
 */
export function familyWiseErrorRate(numberOfTests: number, alpha = 0.05): number {
  return 1 - (1 - alpha) ** numberOfTests;
}

/** Standard error of an estimated Sharpe ratio, under the usual IID assumption. */
export function sharpeStandardError(sharpe: number, observations: number): number {
  // `observations` is the number of PERIODS the Sharpe was measured over — often
  // years. One year is a legitimate, if uninformative, sample; only a
  // non-positive count is degenerate.
  if (!(observations > 0)) return Infinity;
  return Math.sqrt((1 + (sharpe * sharpe) / 2) / observations);
}
