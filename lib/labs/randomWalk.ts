import type { FieldSchema } from "@/lib/experiment/config";

export type WalkMode = "randomWalk" | "momentum" | "meanReversion" | "regimeSwitching";

export interface RandomWalkParams {
  mode: WalkMode;
  phi: number;
  drift: number;
  volatility: number;
  steps: number;
  seed: number;
  rollingWindow: number;
  maxLag: number;
}

export const RANDOM_WALK_DEFAULTS: RandomWalkParams = {
  mode: "randomWalk",
  phi: 0.25,
  drift: 0.07,
  volatility: 0.2,
  steps: 1260,
  seed: 42,
  rollingWindow: 40,
  maxLag: 25,
};

export const RANDOM_WALK_SCHEMA: Record<keyof RandomWalkParams, FieldSchema> = {
  mode: { type: "string", options: ["randomWalk", "momentum", "meanReversion", "regimeSwitching"] },
  phi: { type: "number", min: 0, max: 0.8 },
  drift: { type: "number", min: -0.5, max: 0.5 },
  volatility: { type: "number", min: 0.02, max: 1 },
  steps: { type: "integer", min: 252, max: 5040 },
  seed: { type: "integer", min: 0, max: 4_294_967_295 },
  rollingWindow: { type: "integer", min: 5, max: 250 },
  maxLag: { type: "integer", min: 5, max: 60 },
};

export const RANDOM_WALK_LABELS: Record<keyof RandomWalkParams, string> = {
  mode: "Process",
  phi: "Memory strength |φ|",
  drift: "Annual drift",
  volatility: "Annual volatility",
  steps: "Trading days",
  seed: "Random seed",
  rollingWindow: "Rolling window",
  maxLag: "Maximum lag shown",
};

export const MODE_LABELS: Record<WalkMode, string> = {
  randomWalk: "A — Random walk",
  momentum: "B — Momentum",
  meanReversion: "C — Mean reversion",
  regimeSwitching: "D — Regime switching",
};

export const MODE_SUMMARIES: Record<WalkMode, string> = {
  randomWalk: "Returns are independent. The price is a martingale after drift, and no function of past prices can predict the next move. This is the null hypothesis against which everything else is measured.",
  momentum: "AR(1) with φ > 0. A positive return raises the expected next return, so moves extend into trends and the price path looks smoother than a random walk.",
  meanReversion: "AR(1) with φ < 0. A positive return lowers the expected next return, so moves are partly given back. The path looks jagged and range-bound.",
  regimeSwitching: "Returns are conditionally normal but drawn from a hidden state that persists. Each regime has no memory, yet the series as a whole shows volatility clustering and fat tails.",
};
