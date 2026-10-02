/**
 * Normal distribution utilities.
 *
 * JavaScript has no error function in its standard library, so the cumulative
 * normal distribution has to be approximated. The accuracy of that
 * approximation matters: the normal CDF is the engine inside Black-Scholes, and
 * a sloppy approximation shows up directly as a mispriced option.
 */

const SQRT_2PI = Math.sqrt(2 * Math.PI);
const SQRT_2 = Math.SQRT2;

/**
 * Probability density function of the normal distribution.
 *
 *   f(x) = 1 / (sigma * sqrt(2*pi)) * exp( -(x - mu)^2 / (2 * sigma^2) )
 *
 * The density is NOT a probability — it can exceed 1 when sigma is small. Only
 * the area under it between two points is a probability.
 */
export function normalPDF(x: number, mu = 0, sigma = 1): number {
  if (!(sigma > 0)) throw new Error("normalPDF: sigma must be positive");
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * SQRT_2PI);
}

/**
 * Cumulative distribution function: P(X <= x).
 *
 *   Phi(z) = P(Z <= z) = the area under the standard bell curve left of z.
 *
 * Implemented with Hart's rational approximation (1968), in the arrangement
 * popularised by Graeme West for derivatives work. This reaches close to full
 * double precision — about 1e-15 absolute error — across the whole real line.
 *
 * It matters that this is accurate rather than merely close. The normal CDF is
 * the engine inside Black-Scholes, and the Greeks are DERIVATIVES of the price.
 * Numerically differentiating a function that carries 1e-8 of noise amplifies
 * that noise by 1/(2h): with a step of 1e-5 the error in delta would be around
 * 1e-3, which is visible in the fourth decimal place of a quoted hedge ratio.
 * A single-precision erf approximation is good enough for prices and not good
 * enough for everything downstream of them.
 *
 * The two branches split at |x| ~ 7.07. Below it a ratio of two degree-7
 * polynomials is used; above it the density is so small that a continued
 * fraction for the tail is both cheaper and better conditioned.
 */
function standardNormalCDF(x: number): number {
  const ax = Math.abs(x);
  let tail: number;

  if (ax > 37) {
    // Beyond 37 standard deviations the tail underflows a float64 entirely.
    tail = 0;
  } else {
    const density = Math.exp((-ax * ax) / 2);
    if (ax < 7.07106781186547) {
      let numerator = 3.52624965998911e-2 * ax + 0.700383064443688;
      numerator = numerator * ax + 6.37396220353165;
      numerator = numerator * ax + 33.912866078383;
      numerator = numerator * ax + 112.079291497871;
      numerator = numerator * ax + 221.213596169931;
      numerator = numerator * ax + 220.206867912376;

      let denominator = 8.83883476483184e-2 * ax + 1.75566716318264;
      denominator = denominator * ax + 16.064177579207;
      denominator = denominator * ax + 86.7807322029461;
      denominator = denominator * ax + 296.564248779674;
      denominator = denominator * ax + 637.333633378831;
      denominator = denominator * ax + 793.826512519948;
      denominator = denominator * ax + 440.413735824752;

      tail = (density * numerator) / denominator;
    } else {
      // Continued fraction for the far tail.
      let build = ax + 0.65;
      build = ax + 4 / build;
      build = ax + 3 / build;
      build = ax + 2 / build;
      build = ax + 1 / build;
      tail = density / (build * 2.506628274631);
    }
  }

  // `tail` is the upper-tail probability of |x|; convert by symmetry.
  return x > 0 ? 1 - tail : tail;
}

export function normalCDF(x: number, mu = 0, sigma = 1): number {
  if (!(sigma > 0)) throw new Error("normalCDF: sigma must be positive");
  return standardNormalCDF((x - mu) / sigma);
}

/** Error function, derived from the CDF: erf(x) = 2*Phi(x*sqrt(2)) - 1. */
export function erf(x: number): number {
  return 2 * standardNormalCDF(x * SQRT_2) - 1;
}

/**
 * Inverse CDF (the quantile function, also written Phi^-1 or the "probit").
 * Given a probability p, return the z with P(Z <= z) = p.
 *
 * Uses Peter Acklam's rational approximation, with relative error below
 * 1.15e-9 over the open interval (0, 1) — good to roughly double precision for
 * every practical purpose.
 *
 * This is what converts a confidence level into a Value-at-Risk multiplier: the
 * 95% parametric VaR uses Phi^-1(0.05) = -1.6449.
 */
export function normalInverseCDF(p: number): number {
  if (!(p > 0 && p < 1)) throw new Error("normalInverseCDF: p must be strictly between 0 and 1");

  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;

  if (p < pLow) {
    // Lower tail.
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    // Central region.
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  // Upper tail, by symmetry with the lower tail.
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

/** Probability mass of a binomial distribution: P(X = k) for n trials. */
export function binomialPMF(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return 0;
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

/**
 * log(n choose k), computed with log-gamma to avoid overflow. Computing
 * factorials directly overflows a float64 at n = 171, which is well inside the
 * range of trial counts a user might ask for.
 */
export function logChoose(n: number, k: number): number {
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/** Lanczos approximation to log(Gamma(x)), accurate to ~15 significant digits. */
export function logGamma(x: number): number {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // Reflection formula, for arguments where the series does not converge well.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let sum = 0.99999999999980993;
  for (let i = 0; i < g.length; i++) sum += g[i] / (z + i + 1);
  const t = z + g.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

/** Build a histogram with equal-width bins. Returns bin centres and counts. */
export interface HistogramBin {
  binStart: number;
  binEnd: number;
  center: number;
  count: number;
  density: number;
}

export function histogram(xs: number[], binCount = 40): HistogramBin[] {
  if (xs.length === 0) return [];
  if (!Number.isInteger(binCount) || binCount < 1) throw new Error("histogram: binCount must be a positive integer");
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of xs) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  // A degenerate range (every value identical) would give zero-width bins.
  if (hi === lo) {
    hi = lo + 1;
    lo = lo - 1;
  }
  const width = (hi - lo) / binCount;
  const counts = new Array(binCount).fill(0);
  for (const x of xs) {
    let idx = Math.floor((x - lo) / width);
    if (idx >= binCount) idx = binCount - 1; // the maximum lands in the last bin
    if (idx < 0) idx = 0;
    counts[idx] += 1;
  }
  return counts.map((count, i) => {
    const binStart = lo + i * width;
    const binEnd = binStart + width;
    return {
      binStart,
      binEnd,
      center: (binStart + binEnd) / 2,
      count,
      // Density normalises by total count AND bin width, so the bars are
      // directly comparable to a PDF curve drawn on the same axes.
      density: count / (xs.length * width),
    };
  });
}
