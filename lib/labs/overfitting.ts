import type { FieldSchema } from "@/lib/experiment/config";

export interface OverfittingParams {
  /** Whether the market contains any real signal at all. */
  signalStrength: number;
  steps: number;
  seed: number;
  volatility: number;
  drift: number;
  trainFraction: number;
  validationFraction: number;
  transactionCost: number;
  /** Number of parameter combinations searched. */
  gridSize: number;
}

export const OVERFITTING_DEFAULTS: OverfittingParams = {
  signalStrength: 0,
  steps: 3780,
  seed: 42,
  volatility: 0.2,
  drift: 0.06,
  trainFraction: 0.5,
  validationFraction: 0.25,
  transactionCost: 0.0005,
  gridSize: 240,
};

export const OVERFITTING_SCHEMA: Record<keyof OverfittingParams, FieldSchema> = {
  signalStrength: { type: "number", min: 0, max: 0.4 },
  steps: { type: "integer", min: 756, max: 10080 },
  seed: { type: "integer", min: 0, max: 4_294_967_295 },
  volatility: { type: "number", min: 0.05, max: 0.6 },
  drift: { type: "number", min: -0.2, max: 0.3 },
  trainFraction: { type: "number", min: 0.3, max: 0.7 },
  validationFraction: { type: "number", min: 0.1, max: 0.4 },
  transactionCost: { type: "number", min: 0, max: 0.01 },
  gridSize: { type: "integer", min: 12, max: 600 },
};

export const OVERFITTING_LABELS: Record<keyof OverfittingParams, string> = {
  signalStrength: "True signal strength (φ)",
  steps: "Total trading days",
  seed: "Market seed",
  volatility: "Annual volatility",
  drift: "Annual drift",
  trainFraction: "Training fraction",
  validationFraction: "Validation fraction",
  transactionCost: "Transaction cost",
  gridSize: "Parameter combinations searched",
};

/** The parameter grid searched during "optimisation". */
export const FAST_WINDOWS = [3, 5, 8, 12, 16, 20, 25, 30, 40, 50, 65, 80];
export const SLOW_WINDOWS = [20, 30, 40, 50, 65, 80, 100, 120, 150, 180, 220, 260, 300, 350, 400, 450, 500, 550, 600, 700];
