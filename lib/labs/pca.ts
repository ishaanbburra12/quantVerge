import type { FieldSchema } from "@/lib/experiment/config";

export interface PcaParams {
  dataset: "assets" | "yieldCurve";
  observations: number;
  seed: number;
  /** Strength of the common factor in the asset dataset. */
  marketStrength: number;
  /** Idiosyncratic noise level. */
  noise: number;
  /** How many components to use when reconstructing. */
  reconstructWith: number;
  useCorrelation: number;
}

export const PCA_DEFAULTS: PcaParams = {
  dataset: "yieldCurve",
  observations: 1000,
  seed: 42,
  marketStrength: 0.8,
  noise: 0.4,
  reconstructWith: 2,
  useCorrelation: 0,
};

export const PCA_SCHEMA: Record<keyof PcaParams, FieldSchema> = {
  dataset: { type: "string", options: ["assets", "yieldCurve"] },
  observations: { type: "integer", min: 100, max: 10000 },
  seed: { type: "integer", min: 0, max: 4_294_967_295 },
  marketStrength: { type: "number", min: 0, max: 2 },
  noise: { type: "number", min: 0.05, max: 2 },
  reconstructWith: { type: "integer", min: 1, max: 8 },
  useCorrelation: { type: "integer", min: 0, max: 1 },
};

export const PCA_LABELS: Record<keyof PcaParams, string> = {
  dataset: "Dataset",
  observations: "Observations",
  seed: "Random seed",
  marketStrength: "Common factor strength",
  noise: "Idiosyncratic noise",
  reconstructWith: "Components used to reconstruct",
  useCorrelation: "Use correlation matrix",
};

export const ASSET_NAMES = [
  "Mega-cap tech", "Industrials", "Utilities", "Energy", "Financials", "Healthcare",
];

/** Each asset's exposure to the single common factor. */
export const ASSET_BETAS = [1.35, 1.05, 0.45, 0.9, 1.2, 0.65];

export const CURVE_TENORS = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30];
