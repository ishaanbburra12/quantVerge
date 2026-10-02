import type { FieldSchema } from "@/lib/experiment/config";

export interface BacktestParams {
  marketProcess: "regime" | "trending" | "meanReverting" | "randomWalk";
  steps: number;
  seed: number;
  volatility: number;
  drift: number;
  /** AR(1) coefficient for the trending / mean-reverting markets. */
  phi: number;
  fastWindow: number;
  slowWindow: number;
  lookback: number;
  threshold: number;
  transactionCost: number;
  initialCapital: number;
  strategySeed: number;
}

export const BACKTEST_DEFAULTS: BacktestParams = {
  marketProcess: "regime",
  steps: 2520,
  seed: 42,
  volatility: 0.2,
  drift: 0.07,
  phi: 0.05,
  fastWindow: 20,
  slowWindow: 100,
  lookback: 60,
  threshold: 0.02,
  transactionCost: 0.001,
  initialCapital: 10000,
  strategySeed: 7,
};

export const BACKTEST_SCHEMA: Record<keyof BacktestParams, FieldSchema> = {
  marketProcess: { type: "string", options: ["regime", "trending", "meanReverting", "randomWalk"] },
  steps: { type: "integer", min: 252, max: 7560 },
  seed: { type: "integer", min: 0, max: 4_294_967_295 },
  volatility: { type: "number", min: 0.02, max: 1 },
  drift: { type: "number", min: -0.5, max: 0.5 },
  phi: { type: "number", min: -0.6, max: 0.6 },
  fastWindow: { type: "integer", min: 2, max: 200 },
  slowWindow: { type: "integer", min: 5, max: 400 },
  lookback: { type: "integer", min: 2, max: 400 },
  threshold: { type: "number", min: 0, max: 0.5 },
  transactionCost: { type: "number", min: 0, max: 0.02 },
  initialCapital: { type: "number", min: 100, max: 10_000_000 },
  strategySeed: { type: "integer", min: 0, max: 4_294_967_295 },
};

export const BACKTEST_LABELS: Record<keyof BacktestParams, string> = {
  marketProcess: "Market process",
  steps: "Trading days",
  seed: "Market seed",
  volatility: "Annual volatility",
  drift: "Annual drift",
  phi: "Autocorrelation φ",
  fastWindow: "Fast moving average",
  slowWindow: "Slow moving average",
  lookback: "Momentum lookback",
  threshold: "Signal threshold",
  transactionCost: "Transaction cost",
  initialCapital: "Initial capital",
  strategySeed: "Random-strategy seed",
};

export const MARKET_LABELS: Record<BacktestParams["marketProcess"], string> = {
  regime: "Regime switching (bull / bear / sideways)",
  trending: "Trending — positive autocorrelation",
  meanReverting: "Mean reverting — negative autocorrelation",
  randomWalk: "Random walk — no memory",
};

export const MARKET_DESCRIPTIONS: Record<BacktestParams["marketProcess"], string> = {
  regime: "A hidden Markov market with persistent bull, bear and sideways states. Contains genuine exploitable structure, which the Oracle strategy can measure.",
  trending: "AR(1) returns with φ > 0, so up days tend to follow up days. This is the environment trend-following rules are designed for — and the only one where they should work.",
  meanReverting: "AR(1) returns with φ < 0, so moves get partially given back. Trend-following should lose money here, and mean reversion should win.",
  randomWalk: "Independent returns with no memory whatsoever. There is nothing to find. Any strategy that appears to work here has found noise, and this is the most important case on the page.",
};

export const COST_SCENARIOS = [0, 0.0005, 0.001, 0.0025] as const;
