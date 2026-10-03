import type { FieldSchema } from "@/lib/experiment/config";

export interface GarchLabParams {
  omega: number;
  alpha: number;
  beta: number;
  mu: number;
  steps: number;
  seed: number;
  forecastHorizon: number;
  shockMultiple: number;
}

export const GARCH_DEFAULTS: GarchLabParams = {
  omega: 0.000002,
  alpha: 0.08,
  beta: 0.90,
  mu: 0.0003,
  steps: 2520,
  seed: 42,
  forecastHorizon: 120,
  shockMultiple: 3,
};

export const GARCH_SCHEMA: Record<keyof GarchLabParams, FieldSchema> = {
  omega: { type: "number", min: 1e-9, max: 0.001 },
  alpha: { type: "number", min: 0, max: 0.5 },
  beta: { type: "number", min: 0, max: 0.999 },
  mu: { type: "number", min: -0.01, max: 0.01 },
  steps: { type: "integer", min: 252, max: 10080 },
  seed: { type: "integer", min: 0, max: 4_294_967_295 },
  forecastHorizon: { type: "integer", min: 10, max: 500 },
  shockMultiple: { type: "number", min: 0.1, max: 10 },
};

export const GARCH_LABELS: Record<keyof GarchLabParams, string> = {
  omega: "ω (constant)",
  alpha: "α (reaction)",
  beta: "β (persistence)",
  mu: "μ (mean return)",
  steps: "Trading days",
  seed: "Random seed",
  forecastHorizon: "Forecast horizon",
  shockMultiple: "Starting variance, × long-run",
};
