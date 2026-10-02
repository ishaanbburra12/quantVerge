import type { FieldSchema } from "@/lib/experiment/config";

export interface InferenceParams {
  trueEffect: number;
  populationSd: number;
  sampleSize: number;
  alpha: number;
  seed: number;
  numberOfTests: number;
  replications: number;
}

export const INFERENCE_DEFAULTS: InferenceParams = {
  trueEffect: 0,
  populationSd: 1,
  sampleSize: 30,
  alpha: 0.05,
  seed: 42,
  numberOfTests: 20,
  replications: 2000,
};

export const INFERENCE_SCHEMA: Record<keyof InferenceParams, FieldSchema> = {
  trueEffect: { type: "number", min: -2, max: 2 },
  populationSd: { type: "number", min: 0.05, max: 5 },
  sampleSize: { type: "integer", min: 3, max: 2000 },
  alpha: { type: "number", min: 0.001, max: 0.2 },
  seed: { type: "integer", min: 0, max: 4_294_967_295 },
  numberOfTests: { type: "integer", min: 1, max: 500 },
  replications: { type: "integer", min: 200, max: 20000 },
};

export const INFERENCE_LABELS: Record<keyof InferenceParams, string> = {
  trueEffect: "True effect size",
  populationSd: "Population std deviation",
  sampleSize: "Sample size n",
  alpha: "Significance level α",
  seed: "Random seed",
  numberOfTests: "Number of simultaneous tests",
  replications: "Replications",
};
