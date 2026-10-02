/**
 * Return series and performance / risk metrics.
 *
 * Conventions used consistently across QuantVerge:
 *   - A "price series" is a list of levels (prices, or portfolio equity).
 *   - A "return series" has one FEWER element than the price series it came
 *     from: n prices produce n-1 returns.
 *   - Returns are simple (arithmetic) unless the function name says `log`.
 *   - `periodsPerYear` defaults to 252, the approximate number of US trading
 *     days in a year. For monthly data use 12, for weekly 52.
 */

import { mean, standardDeviation, percentile, variance } from "@/lib/statistics/descriptive";

/**
 * Simple returns: r_t = (P_t - P_{t-1}) / P_{t-1} = P_t / P_{t-1} - 1.
 *
 * Simple returns are what you actually earn over one period, and they aggregate
 * correctly ACROSS assets: the return of a portfolio is the weighted average of
 * its holdings' simple returns. They do NOT aggregate conveniently across TIME,
 * because you have to multiply (1 + r) factors rather than add returns.
 */
export function returns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    if (prev === 0) throw new Error("returns: cannot compute a return from a zero price");
    out.push(prices[i] / prev - 1);
  }
  return out;
}

/**
 * Log returns: r_t = ln(P_t / P_{t-1}).
 *
 * Log returns are ADDITIVE over time — the log return over a year is exactly
 * the sum of the daily log returns — which is why every model built on Brownian
 * motion works in log space. They are also symmetric: a move that halves your
 * money is -ln(2), and doubling it is +ln(2), whereas in simple returns the
 * same two moves are -50% and +100%.
 *
 * The trade-off is that log returns do NOT aggregate across assets: the log
 * return of a portfolio is not the weighted average of its holdings' log
 * returns. Use simple returns for cross-sectional work, log returns for
 * time-series work.
 *
 * For small moves the two are nearly identical, since ln(1 + r) ~ r.
 */
export function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] <= 0 || prices[i - 1] <= 0) {
      throw new Error("logReturns: prices must be strictly positive");
    }
    out.push(Math.log(prices[i] / prices[i - 1]));
  }
  return out;
}

/** Rebuild a price series from simple returns, starting at `initial`. */
export function pricesFromReturns(rets: number[], initial = 100): number[] {
  const out = [initial];
  for (const r of rets) out.push(out[out.length - 1] * (1 + r));
  return out;
}

/** Cumulative (total) return over the whole series: product of (1 + r) minus 1. */
export function cumulativeReturn(rets: number[]): number {
  let growth = 1;
  for (const r of rets) growth *= 1 + r;
  return growth - 1;
}

/** The running equity curve implied by a return series, as a growth multiple. */
export function cumulativeReturnSeries(rets: number[]): number[] {
  const out: number[] = [];
  let growth = 1;
  for (const r of rets) {
    growth *= 1 + r;
    out.push(growth - 1);
  }
  return out;
}

/**
 * Annualised (geometric) return, also called CAGR.
 *
 *   CAGR = (final / initial)^(periodsPerYear / n) - 1
 *
 * This is the constant yearly rate that would have produced the same final
 * value. It is strictly less than the arithmetic average return whenever
 * returns vary at all — a consequence of Jensen's inequality, and the formal
 * statement of "volatility drag". A +50% year followed by a -50% year averages
 * 0% arithmetically but leaves you down 25%.
 *
 * Returns NaN-free 0 for an empty series. If total growth reaches zero or below
 * (a complete wipeout) the geometric rate is -100%.
 */
export function annualisedReturn(rets: number[], periodsPerYear = 252): number {
  if (rets.length === 0) return 0;
  let growth = 1;
  for (const r of rets) growth *= 1 + r;
  if (growth <= 0) return -1;
  return growth ** (periodsPerYear / rets.length) - 1;
}

/** Annualised volatility: per-period standard deviation times sqrt(periods). */
export function annualisedVolatility(rets: number[], periodsPerYear = 252): number {
  if (rets.length < 2) return 0;
  return standardDeviation(rets, 1) * Math.sqrt(periodsPerYear);
}

/**
 * Sharpe ratio: excess return per unit of total volatility.
 *
 *   Sharpe = (E[R_p] - R_f) / sd(R_p)
 *
 * Both numerator and denominator are annualised here. `riskFreeRate` is an
 * ANNUAL rate and is converted to a per-period rate before subtracting, so the
 * excess return is measured period by period.
 *
 * Three things to be careful about:
 *   1. It penalises upside volatility exactly as much as downside volatility.
 *   2. It assumes returns are roughly normal; with fat tails or strong skew it
 *      flatters strategies that sell insurance and blow up rarely.
 *   3. It is a SAMPLE estimate with real uncertainty. Its standard error is
 *      roughly sqrt((1 + Sharpe^2/2)/n), so a one-year backtest reporting
 *      Sharpe 1.0 has a standard error near 0.65. Treat small-sample Sharpes
 *      as noise until proven otherwise.
 *
 * Returns 0 when volatility is zero, since the ratio is undefined there.
 */
export function sharpeRatio(rets: number[], riskFreeRate = 0, periodsPerYear = 252): number {
  if (rets.length < 2) return 0;
  const perPeriodRf = riskFreeRate / periodsPerYear;
  const excess = rets.map((r) => r - perPeriodRf);
  const sd = standardDeviation(excess, 1);
  if (sd === 0) return 0;
  return (mean(excess) / sd) * Math.sqrt(periodsPerYear);
}

/**
 * Downside deviation: the standard-deviation-like spread of returns BELOW a
 * target (the "minimum acceptable return", here the risk-free rate).
 *
 *   DD = sqrt( (1/n) * sum over all t of min(r_t - target, 0)^2 )
 *
 * Note the divisor: we sum only the shortfalls but divide by the FULL count n,
 * not by the number of losing periods. That is the standard definition, and it
 * is what makes a strategy with few losses score better than one with many
 * losses of the same size. Dividing by the count of losses instead is a common
 * implementation bug.
 */
export function downsideDeviation(rets: number[], target = 0, periodsPerYear = 252): number {
  if (rets.length === 0) return 0;
  const perPeriodTarget = target / periodsPerYear;
  let sumSquares = 0;
  for (const r of rets) {
    const shortfall = Math.min(r - perPeriodTarget, 0);
    sumSquares += shortfall * shortfall;
  }
  return Math.sqrt(sumSquares / rets.length) * Math.sqrt(periodsPerYear);
}

/**
 * Sortino ratio: excess return per unit of DOWNSIDE deviation.
 *
 *   Sortino = (E[R_p] - R_f) / DownsideDeviation
 *
 * Same shape as Sharpe, but it stops punishing a strategy for having big
 * winning days. A strategy whose Sortino greatly exceeds its Sharpe has
 * upside-skewed returns; one where they are close has roughly symmetric
 * returns.
 */
export function sortinoRatio(rets: number[], riskFreeRate = 0, periodsPerYear = 252): number {
  if (rets.length < 2) return 0;
  const dd = downsideDeviation(rets, riskFreeRate, periodsPerYear);
  if (dd === 0) return 0;
  const perPeriodRf = riskFreeRate / periodsPerYear;
  const annualExcess = mean(rets.map((r) => r - perPeriodRf)) * periodsPerYear;
  return annualExcess / dd;
}

/**
 * Maximum drawdown, plus the indices responsible for it.
 *
 * A drawdown at time t is how far below the running maximum ("high-water mark")
 * the series has fallen:
 *   DD_t = (V_t - max(V_0..V_t)) / max(V_0..V_t)
 *
 * The maximum drawdown is the most negative of those, reported here as a
 * POSITIVE fraction (0.25 means a 25% peak-to-trough fall).
 *
 * The single-pass algorithm is subtle and worth understanding. We track the
 * running peak. Each step we measure the decline from that peak. When we find a
 * worse decline than any seen before, we record not just the depth but the
 * INDEX OF THE PEAK THAT WAS IN FORCE AT THAT MOMENT. A common bug is to
 * report the series' global maximum as the peak, which is wrong whenever the
 * worst drawdown happened before the all-time high.
 *
 * Drawdown is path-dependent: unlike volatility, reordering the same returns
 * changes the answer. That is exactly why it captures a risk that volatility
 * misses — the lived experience of losing money for a long stretch.
 */
export interface DrawdownResult {
  maxDrawdown: number;
  peakIndex: number;
  troughIndex: number;
  /** Index at which the series first regained the peak; null if never. */
  recoveryIndex: number | null;
  /** Longest run of consecutive periods spent below a prior peak. */
  longestDrawdownLength: number;
  /** The full drawdown series, as negative fractions. */
  series: number[];
}

export function maxDrawdown(values: number[]): DrawdownResult {
  if (values.length === 0) {
    return { maxDrawdown: 0, peakIndex: 0, troughIndex: 0, recoveryIndex: null, longestDrawdownLength: 0, series: [] };
  }
  let peak = values[0];
  let peakIdx = 0;
  let worst = 0;
  let bestPeakIdx = 0;
  let troughIdx = 0;
  const series: number[] = [];

  let underwaterRun = 0;
  let longestUnderwater = 0;

  for (let i = 0; i < values.length; i++) {
    if (values[i] > peak) {
      peak = values[i];
      peakIdx = i;
      underwaterRun = 0;
    } else if (values[i] < peak) {
      underwaterRun += 1;
      if (underwaterRun > longestUnderwater) longestUnderwater = underwaterRun;
    }
    // Guard against a non-positive peak, which would divide by zero.
    const dd = peak > 0 ? (values[i] - peak) / peak : 0;
    series.push(dd);
    if (dd < worst) {
      worst = dd;
      bestPeakIdx = peakIdx;
      troughIdx = i;
    }
  }

  // Find where (if ever) the series climbed back to the peak that preceded the
  // worst trough.
  let recoveryIndex: number | null = null;
  const peakValue = values[bestPeakIdx];
  for (let i = troughIdx + 1; i < values.length; i++) {
    if (values[i] >= peakValue) {
      recoveryIndex = i;
      break;
    }
  }

  return {
    maxDrawdown: Math.abs(worst),
    peakIndex: bestPeakIdx,
    troughIndex: troughIdx,
    recoveryIndex,
    longestDrawdownLength: longestUnderwater,
    series,
  };
}

/** Calmar ratio: annualised return divided by maximum drawdown. */
export function calmarRatio(rets: number[], periodsPerYear = 252): number {
  const equity = pricesFromReturns(rets, 1);
  const dd = maxDrawdown(equity).maxDrawdown;
  if (dd === 0) return 0;
  return annualisedReturn(rets, periodsPerYear) / dd;
}

export type VarMethod = "historical" | "parametric" | "monteCarlo";

/**
 * Historical Value at Risk.
 *
 * VaR at confidence c is the loss threshold that is exceeded only (1 - c) of
 * the time. At 95% confidence we take the 5th percentile of the return
 * distribution and report it as a positive loss number.
 *
 * READ THIS CAREFULLY, because it is the most misunderstood number in risk
 * management: VaR is NOT the worst possible loss. A 95% one-day VaR of 2% says
 * "on about 1 day in 20, I lose more than 2%". It says NOTHING about how much
 * more. The entire tail beyond the threshold is invisible to it. Two portfolios
 * can have identical VaR while one risks a 3% bad day and the other risks total
 * ruin. That blind spot is why CVaR exists.
 */
export function valueAtRisk(rets: number[], confidence = 0.95): number {
  if (rets.length === 0) return 0;
  if (!(confidence > 0 && confidence < 1)) throw new Error("valueAtRisk: confidence must be between 0 and 1");
  const cutoff = percentile(rets, (1 - confidence) * 100);
  // Report as a positive magnitude of loss. A positive cutoff means even the
  // tail was profitable, in which case the loss is zero.
  return Math.max(0, -cutoff);
}

/**
 * Parametric (Gaussian / variance-covariance) VaR.
 *
 *   VaR = -(mu + z_{1-c} * sigma)
 *
 * where z_{1-c} is the normal quantile at the tail probability (negative). This
 * assumes returns are normally distributed, so it needs only two numbers — the
 * mean and standard deviation — and gives a smooth answer even from very little
 * data. The price of that convenience is that real returns have fat tails, so
 * parametric VaR systematically UNDERSTATES tail risk. Comparing it against the
 * historical estimate on the same data is a quick fat-tail diagnostic.
 */
export function parametricVaR(rets: number[], confidence = 0.95, normalInverse: (p: number) => number): number {
  if (rets.length < 2) return 0;
  const mu = mean(rets);
  const sd = standardDeviation(rets, 1);
  const z = normalInverse(1 - confidence);
  return Math.max(0, -(mu + z * sd));
}

/**
 * Conditional Value at Risk (also: Expected Shortfall, ES).
 *
 * CVaR is the AVERAGE loss given that you are already in the worst (1 - c) of
 * cases — the mean of the tail, not its edge. It therefore answers the question
 * VaR cannot: "when it goes badly, how badly?"
 *
 * CVaR is always at least as large as VaR. It is also mathematically better
 * behaved: CVaR is a coherent risk measure, and in particular it is SUBADDITIVE
 * (the CVaR of a combined portfolio never exceeds the sum of the parts' CVaRs),
 * so diversification can never look like it increases risk. VaR fails that
 * property, which can produce the absurd conclusion that splitting a portfolio
 * in two made it riskier.
 */
export function conditionalVaR(rets: number[], confidence = 0.95): number {
  if (rets.length === 0) return 0;
  const cutoff = percentile(rets, (1 - confidence) * 100);
  const tail = rets.filter((r) => r <= cutoff);
  // With very few observations the tail can be empty after filtering; fall back
  // to the single worst observation so the metric stays defined.
  if (tail.length === 0) return Math.max(0, -Math.min(...rets));
  return Math.max(0, -mean(tail));
}

/** Fraction of periods with a positive return. */
export function hitRate(rets: number[]): number {
  if (rets.length === 0) return 0;
  return rets.filter((r) => r > 0).length / rets.length;
}

/** Sum of gains divided by the absolute sum of losses. */
export function profitFactor(rets: number[]): number {
  let gains = 0;
  let losses = 0;
  for (const r of rets) {
    if (r > 0) gains += r;
    else losses -= r;
  }
  if (losses === 0) return gains > 0 ? Infinity : 0;
  return gains / losses;
}

/** Beta of a return series against a benchmark: Cov(a,b) / Var(b). */
export function beta(assetReturns: number[], benchmarkReturns: number[]): number {
  if (assetReturns.length !== benchmarkReturns.length) {
    throw new Error("beta: series must have equal length");
  }
  const varB = variance(benchmarkReturns, 1);
  if (varB === 0) return 0;
  const mA = mean(assetReturns);
  const mB = mean(benchmarkReturns);
  let cov = 0;
  for (let i = 0; i < assetReturns.length; i++) {
    cov += (assetReturns[i] - mA) * (benchmarkReturns[i] - mB);
  }
  cov /= assetReturns.length - 1;
  return cov / varB;
}
