import type { FieldSchema } from "@/lib/experiment/config";

export interface CorrelationParams {
  returnA: number;
  volA: number;
  returnB: number;
  volB: number;
  rho: number;
  weightA: number;
  steps: number;
  seed: number;
}

export const CORRELATION_DEFAULTS: CorrelationParams = {
  returnA: 0.1,
  volA: 0.2,
  returnB: 0.08,
  volB: 0.18,
  rho: 0.3,
  weightA: 0.5,
  steps: 1260,
  seed: 42,
};

export const CORRELATION_SCHEMA: Record<keyof CorrelationParams, FieldSchema> = {
  returnA: { type: "number", min: -0.5, max: 0.5 },
  volA: { type: "number", min: 0.01, max: 1 },
  returnB: { type: "number", min: -0.5, max: 0.5 },
  volB: { type: "number", min: 0.01, max: 1 },
  rho: { type: "number", min: -1, max: 1 },
  weightA: { type: "number", min: 0, max: 1 },
  steps: { type: "integer", min: 252, max: 5040 },
  seed: { type: "integer", min: 0, max: 4_294_967_295 },
};

export const CORRELATION_LABELS: Record<keyof CorrelationParams, string> = {
  returnA: "Asset A expected return",
  volA: "Asset A volatility",
  returnB: "Asset B expected return",
  volB: "Asset B volatility",
  rho: "Correlation ρ",
  weightA: "Weight in A",
  steps: "Trading days",
  seed: "Random seed",
};

export const SHOWCASE_RHOS = [-1, -0.5, 0, 0.5, 1] as const;
