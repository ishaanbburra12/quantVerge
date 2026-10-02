/**
 * Trading strategies for the backtesting and overfitting labs.
 *
 * Every strategy produces a POSITION series: the fraction of capital invested at
 * the start of each day. The single most important implementation detail in this
 * whole file is the one-step lag.
 *
 * LOOK-AHEAD BIAS. A signal computed from day t's closing price cannot be acted
 * on until day t+1. If you multiply day t's signal by day t's return, you are
 * trading on information you did not have, and almost any rule will look
 * profitable — including rules that are pure noise. This is the single most
 * common error in amateur backtests, and it is silent: nothing breaks, the
 * equity curve simply rises.
 *
 * Every function here returns positions already aligned so that
 * `positions[t]` is the exposure held THROUGH day t, decided using data up to
 * day t-1 only. `applyStrategy` enforces that alignment in one place so no
 * individual strategy can get it wrong.
 */

import { rollingMean, mean, standardDeviation } from "@/lib/statistics/descriptive";
import { mulberry32 } from "@/lib/math/random";

export type StrategyKind =
  | "buyAndHold"
  | "movingAverageCrossover"
  | "momentum"
  | "meanReversion"
  | "random"
  | "alwaysCash"
  | "oracle";

export interface StrategyParams {
  fastWindow: number;
  slowWindow: number;
  lookback: number;
  threshold: number;
  seed: number;
}

export const STRATEGY_LABELS: Record<StrategyKind, string> = {
  buyAndHold: "Buy and hold",
  movingAverageCrossover: "Moving-average crossover",
  momentum: "Momentum",
  meanReversion: "Mean reversion",
  random: "Random",
  alwaysCash: "Always cash",
  oracle: "Oracle (knows the regime)",
};

export const STRATEGY_DESCRIPTIONS: Record<StrategyKind, string> = {
  buyAndHold: "Fully invested at all times. Zero turnover, so transaction costs never touch it — which is precisely why it is such a demanding benchmark.",
  movingAverageCrossover: "Invested when the fast moving average sits above the slow one. The classic trend-following rule, and a reliable way to generate turnover.",
  momentum: "Invested when the trailing return over the lookback window exceeds the threshold. Profits if returns are positively autocorrelated.",
  meanReversion: "Invested when the trailing return falls BELOW the negative threshold — buying weakness. Profits if returns are negatively autocorrelated.",
  random: "Flips a seeded coin each day. Included as a null hypothesis: any strategy that cannot beat this has demonstrated nothing.",
  alwaysCash: "Never invested. The floor, and a reminder that zero return is still an option with zero risk.",
  oracle: "Invested only during bull regimes, using the hidden state directly. Impossible in practice — it measures whether the market contains exploitable structure at all.",
};

/**
 * Generate the raw signal for a strategy: the desired exposure on each day,
 * computed from the data available UP TO AND INCLUDING that day.
 *
 * `null` means "no signal yet" (insufficient history), which `applyStrategy`
 * converts to a flat position rather than guessing.
 */
function rawSignal(
  kind: StrategyKind,
  prices: number[],
  returns: number[],
  params: StrategyParams,
  hiddenRegimes?: number[],
): (number | null)[] {
  const n = returns.length;

  if (kind === "buyAndHold") return new Array(n).fill(1);
  if (kind === "alwaysCash") return new Array(n).fill(0);

  if (kind === "random") {
    const rng = mulberry32(params.seed);
    return Array.from({ length: n }, () => (rng() < 0.5 ? 0 : 1));
  }

  if (kind === "oracle") {
    // Regime 0 is Bull by convention in the regime generator.
    if (!hiddenRegimes) return new Array(n).fill(null);
    return hiddenRegimes.map((state) => (state === 0 ? 1 : 0));
  }

  if (kind === "movingAverageCrossover") {
    // Moving averages are computed on PRICES. prices has length n+1, so we drop
    // the first element to align with the return series.
    const fast = rollingMean(prices, params.fastWindow);
    const slow = rollingMean(prices, params.slowWindow);
    const out: (number | null)[] = [];
    for (let i = 0; i < n; i++) {
      // prices[i + 1] corresponds to the close of day i.
      const f = fast[i + 1];
      const s = slow[i + 1];
      out.push(f === null || s === null ? null : f > s ? 1 : 0);
    }
    return out;
  }

  // Momentum and mean reversion both use the trailing return over `lookback`.
  const out: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    if (i < params.lookback) {
      out.push(null);
      continue;
    }
    // Total return over the trailing window, from prices to avoid compounding
    // errors in a sum of simple returns.
    const trailing = prices[i + 1] / prices[i + 1 - params.lookback] - 1;
    if (kind === "momentum") out.push(trailing > params.threshold ? 1 : 0);
    else out.push(trailing < -params.threshold ? 1 : 0);
  }
  return out;
}

export interface BacktestResult {
  /** Exposure held through each day. positions[t] was decided using data to t-1. */
  positions: number[];
  /** Strategy returns net of costs. */
  returns: number[];
  /** Strategy returns before costs, for isolating the cost effect. */
  grossReturns: number[];
  equity: number[];
  /** Total fraction of capital traded over the whole backtest. */
  turnover: number;
  trades: number;
  totalCost: number;
  /** Fraction of days spent invested. */
  exposure: number;
}

/**
 * Run a strategy over a return series.
 *
 * `transactionCost` is charged on the ABSOLUTE CHANGE in position, as a fraction
 * of traded notional. Going from 0 to 1 and back costs twice — which is the
 * correct accounting, and the reason a strategy that flips frequently is so
 * expensive to run.
 */
export function applyStrategy(
  kind: StrategyKind,
  prices: number[],
  returns: number[],
  params: StrategyParams,
  transactionCost: number,
  hiddenRegimes?: number[],
): BacktestResult {
  const signal = rawSignal(kind, prices, returns, params, hiddenRegimes);
  const n = returns.length;

  const positions = new Array<number>(n).fill(0);
  const netReturns = new Array<number>(n).fill(0);
  const grossReturns = new Array<number>(n).fill(0);

  let turnover = 0;
  let trades = 0;
  let totalCost = 0;
  let previousPosition = 0;
  let investedDays = 0;

  for (let t = 0; t < n; t++) {
    // THE LAG. The position held through day t is decided by the signal from
    // day t-1, because day t's own data is not available when the position is
    // taken. Using signal[t] here would be look-ahead bias.
    const desired = t === 0 ? 0 : signal[t - 1];
    const position = desired ?? previousPosition;
    positions[t] = position;
    if (position !== 0) investedDays += 1;

    const traded = Math.abs(position - previousPosition);
    if (traded > 1e-12) {
      turnover += traded;
      trades += 1;
    }
    const cost = traded * transactionCost;
    totalCost += cost;

    grossReturns[t] = position * returns[t];
    netReturns[t] = grossReturns[t] - cost;
    previousPosition = position;
  }

  const equity = [1];
  for (const r of netReturns) equity.push(equity[equity.length - 1] * (1 + r));

  return {
    positions,
    returns: netReturns,
    grossReturns,
    equity,
    turnover,
    trades,
    totalCost,
    exposure: n > 0 ? investedDays / n : 0,
  };
}

/**
 * Sharpe ratio of a strategy, used as the optimisation objective in the
 * Overfitting Lab. Separated out so the two labs score strategies identically.
 */
export function strategySharpe(returns: number[], periodsPerYear = 252): number {
  if (returns.length < 2) return 0;
  const sd = standardDeviation(returns, 1);
  if (sd === 0) return 0;
  return (mean(returns) / sd) * Math.sqrt(periodsPerYear);
}
