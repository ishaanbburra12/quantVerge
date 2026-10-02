/**
 * Descriptive statistics.
 *
 * A note on an easy-to-miss distinction that shows up throughout this file:
 * the difference between a POPULATION statistic and a SAMPLE statistic.
 *
 * If you have every value that exists, divide by n. If your values are a sample
 * drawn from some larger process (which is the situation in every finance
 * application — you observe 250 returns out of infinitely many the process
 * could have produced), dividing by n systematically UNDERSTATES the spread,
 * because you measured deviations from the sample mean rather than the true
 * mean, and the sample mean sits closer to your own data than the truth does.
 * Dividing by (n - 1) corrects that bias. This is Bessel's correction.
 *
 * QuantLab defaults to the sample versions, because QuantLab always works with
 * samples.
 */

function requireNonEmpty(xs: number[], fn: string): void {
  if (xs.length === 0) throw new Error(`${fn}: requires at least one value`);
}

export function mean(xs: number[]): number {
  requireNonEmpty(xs, "mean");
  let total = 0;
  for (const x of xs) total += x;
  return total / xs.length;
}

export function median(xs: number[]): number {
  requireNonEmpty(xs, "median");
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Variance. `ddof` is the "delta degrees of freedom": the divisor is n - ddof.
 * ddof = 1 (default) gives the unbiased sample variance; ddof = 0 gives the
 * population variance.
 *
 * Variance is a mean of squared numbers, so it can never be negative. We clamp
 * at zero to absorb floating-point error on near-constant inputs, which would
 * otherwise return something like -1e-18 and produce NaN under a square root.
 */
export function variance(xs: number[], ddof: 0 | 1 = 1): number {
  requireNonEmpty(xs, "variance");
  const n = xs.length;
  if (n - ddof <= 0) return 0;
  const mu = mean(xs);
  let sumSquares = 0;
  for (const x of xs) {
    const d = x - mu;
    sumSquares += d * d;
  }
  return Math.max(0, sumSquares / (n - ddof));
}

export function standardDeviation(xs: number[], ddof: 0 | 1 = 1): number {
  return Math.sqrt(variance(xs, ddof));
}

/**
 * Sample skewness (the adjusted Fisher-Pearson standardised moment, g1 scaled
 * to G1 — the same definition SciPy uses with bias=False and Excel's SKEW).
 *
 * Skewness measures asymmetry. Zero means symmetric. Negative means the left
 * tail is longer: a few large losses among many small gains, which is the
 * typical shape of equity returns.
 */
export function skewness(xs: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mu = mean(xs);
  const sd = standardDeviation(xs, 1);
  if (sd === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += ((x - mu) / sd) ** 3;
  return (n / ((n - 1) * (n - 2))) * sum;
}

/**
 * Sample EXCESS kurtosis, bias-corrected (SciPy `kurtosis(bias=False)`,
 * Excel's KURT).
 *
 * Kurtosis measures how much of the variance comes from rare extreme values.
 * "Excess" means we subtract 3, the kurtosis of a normal distribution, so a
 * normal distribution scores 0. A positive value means FAT TAILS: extreme
 * moves are more likely than a normal distribution would predict. Real market
 * returns reliably show positive excess kurtosis, which is precisely why the
 * Gaussian models in these labs understate crash risk.
 */
export function kurtosis(xs: number[]): number {
  const n = xs.length;
  if (n < 4) return 0;
  const mu = mean(xs);
  const sd = standardDeviation(xs, 1);
  if (sd === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += ((x - mu) / sd) ** 4;
  const g2 = sum / n - 3;
  return ((n - 1) * ((n + 1) * g2 + 6)) / ((n - 2) * (n - 3));
}

/**
 * Percentile by linear interpolation between order statistics — the same
 * method as NumPy's default `percentile(..., method="linear")`.
 *
 * `p` is given in percent (0-100). The rank of the requested percentile is
 * h = (n - 1) * p / 100, which may fall between two data points; we blend the
 * two neighbours in proportion to the fractional part.
 */
export function percentile(xs: number[], p: number): number {
  requireNonEmpty(xs, "percentile");
  if (!Number.isFinite(p) || p < 0 || p > 100) {
    throw new Error("percentile: p must be between 0 and 100");
  }
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const h = ((sorted.length - 1) * p) / 100;
  const lower = Math.floor(h);
  const upper = Math.ceil(h);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (h - lower) * (sorted[upper] - sorted[lower]);
}

export function quantile(xs: number[], q: number): number {
  return percentile(xs, q * 100);
}

export function minimum(xs: number[]): number {
  requireNonEmpty(xs, "minimum");
  return xs.reduce((a, b) => (b < a ? b : a), xs[0]);
}

export function maximum(xs: number[]): number {
  requireNonEmpty(xs, "maximum");
  return xs.reduce((a, b) => (b > a ? b : a), xs[0]);
}

/**
 * Sample covariance of two equal-length series.
 *
 * Covariance asks: when x is above its mean, does y tend to be above its mean
 * too? It is the raw building block of portfolio theory, but its units are
 * (units of x)(units of y), which makes the magnitude hard to interpret. That
 * is what correlation fixes.
 */
export function covariance(xs: number[], ys: number[], ddof: 0 | 1 = 1): number {
  if (xs.length !== ys.length) throw new Error("covariance: series must have equal length");
  requireNonEmpty(xs, "covariance");
  const n = xs.length;
  if (n - ddof <= 0) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (xs[i] - mx) * (ys[i] - my);
  return sum / (n - ddof);
}

/**
 * Pearson correlation: covariance normalised by both standard deviations.
 *
 *   rho = Cov(x, y) / (sd(x) * sd(y))
 *
 * This is dimensionless and bounded in [-1, 1]. It measures only LINEAR
 * association: two series can be perfectly dependent (y = x^2) and still have
 * a correlation near zero. If either series is constant its standard deviation
 * is zero, correlation is undefined, and we return 0 rather than NaN.
 *
 * Floating-point error can push the result a hair outside [-1, 1] for
 * near-identical inputs, so we clamp.
 */
export function correlation(xs: number[], ys: number[]): number {
  const sx = standardDeviation(xs, 1);
  const sy = standardDeviation(ys, 1);
  if (sx === 0 || sy === 0) return 0;
  const r = covariance(xs, ys, 1) / (sx * sy);
  return Math.min(1, Math.max(-1, r));
}

/**
 * Autocorrelation at a given lag: the correlation of the series with a
 * time-shifted copy of itself.
 *
 * This is the central diagnostic for "does the past say anything about the
 * future?" in a time series.
 *   lag-1 > 0  -> momentum / trending (up days follow up days)
 *   lag-1 < 0  -> mean reversion (up days follow down days)
 *   lag-1 ~ 0  -> a random walk, no linear memory
 *
 * We use the standard estimator, which divides every lag by the SAME total
 * variance computed from the full series (rather than correlating the two
 * overlapping windows separately). This is what statistics packages report,
 * and it guarantees the function is positive semi-definite — a mathematical
 * requirement for a valid autocorrelation function.
 */
export function autocorrelation(xs: number[], lag: number): number {
  if (!Number.isInteger(lag) || lag < 0) throw new Error("autocorrelation: lag must be a non-negative integer");
  const n = xs.length;
  if (lag === 0) return 1;
  if (lag >= n) return 0;
  const mu = mean(xs);
  let denominator = 0;
  for (const x of xs) denominator += (x - mu) ** 2;
  if (denominator === 0) return 0;
  let numerator = 0;
  for (let i = 0; i < n - lag; i++) numerator += (xs[i] - mu) * (xs[i + lag] - mu);
  return numerator / denominator;
}

/** Autocorrelation at lags 1..maxLag, for plotting a correlogram. */
export function autocorrelationFunction(xs: number[], maxLag: number): number[] {
  const out: number[] = [];
  for (let lag = 1; lag <= maxLag; lag++) out.push(autocorrelation(xs, lag));
  return out;
}

/**
 * Approximate 95% confidence band for the autocorrelation of white noise.
 * Under the null hypothesis of no autocorrelation, each estimate is roughly
 * normal with standard error 1/sqrt(n), so bars inside +/- 1.96/sqrt(n) are
 * not distinguishable from noise at the 5% level.
 */
export function autocorrelationConfidenceBand(n: number): number {
  if (n <= 0) return 0;
  return 1.96 / Math.sqrt(n);
}

/**
 * Rolling (moving) mean over a trailing window.
 *
 * The output has the same length as the input. The first (window - 1) entries
 * have too little history to fill the window and are returned as `null` rather
 * than as a partial average. This is deliberate: silently averaging a shorter
 * window makes early values look artificially smooth, and in a backtest a
 * partial window is a subtle way to leak information about series length.
 */
export function rollingMean(xs: number[], window: number): (number | null)[] {
  if (!Number.isInteger(window) || window < 1) throw new Error("rollingMean: window must be a positive integer");
  const out: (number | null)[] = new Array(xs.length).fill(null);
  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i];
    if (i >= window) sum -= xs[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

/**
 * Rolling standard deviation of returns, annualised.
 *
 * Volatility scales with the SQUARE ROOT of time, not with time. The reason is
 * that the variance of a sum of independent returns adds linearly: if daily
 * variance is s^2 then annual variance is 252 * s^2, so annual standard
 * deviation is sqrt(252) * s. This "square-root-of-time rule" depends entirely
 * on returns being independent — the moment returns are autocorrelated, it is
 * wrong, and real markets do show volatility clustering.
 *
 * Pass `periodsPerYear = 1` to get the raw, un-annualised value.
 */
export function rollingVolatility(returns: number[], window: number, periodsPerYear = 252): (number | null)[] {
  if (!Number.isInteger(window) || window < 2) {
    throw new Error("rollingVolatility: window must be an integer >= 2");
  }
  const out: (number | null)[] = new Array(returns.length).fill(null);
  const scale = Math.sqrt(periodsPerYear);
  for (let i = window - 1; i < returns.length; i++) {
    out[i] = standardDeviation(returns.slice(i - window + 1, i + 1), 1) * scale;
  }
  return out;
}

/** Standardise to mean 0, standard deviation 1 (a "z-score" transform). */
export function zScores(xs: number[]): number[] {
  const mu = mean(xs);
  const sd = standardDeviation(xs, 1);
  if (sd === 0) return xs.map(() => 0);
  return xs.map((x) => (x - mu) / sd);
}

/** A compact summary used by the metric panels across the labs. */
export interface Summary {
  count: number;
  mean: number;
  median: number;
  standardDeviation: number;
  skewness: number;
  kurtosis: number;
  min: number;
  max: number;
  p5: number;
  p25: number;
  p75: number;
  p95: number;
}

export function summarise(xs: number[]): Summary {
  requireNonEmpty(xs, "summarise");
  return {
    count: xs.length,
    mean: mean(xs),
    median: median(xs),
    standardDeviation: standardDeviation(xs, 1),
    skewness: skewness(xs),
    kurtosis: kurtosis(xs),
    min: minimum(xs),
    max: maximum(xs),
    p5: percentile(xs, 5),
    p25: percentile(xs, 25),
    p75: percentile(xs, 75),
    p95: percentile(xs, 95),
  };
}
