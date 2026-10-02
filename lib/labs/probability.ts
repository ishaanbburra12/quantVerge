import type { FieldSchema } from "@/lib/experiment/config";

export type Experiment = "coin" | "dice" | "lln" | "clt" | "bayes";

export interface ProbabilityParams {
  experiment: Experiment;
  trials: number;
  probability: number;
  seed: number;
  /** Sample size per mean, for the CLT demonstration. */
  sampleSize: number;
  /** Source distribution for the CLT demonstration. */
  sourceDistribution: "uniform" | "exponential" | "bernoulli" | "bimodal";
  /** Bayes: prior probability of the hypothesis. */
  prior: number;
  /** Bayes: P(evidence | hypothesis) — the test's sensitivity. */
  sensitivity: number;
  /** Bayes: P(no evidence | no hypothesis) — the test's specificity. */
  specificity: number;
}

export const PROBABILITY_DEFAULTS: ProbabilityParams = {
  experiment: "coin",
  trials: 1000,
  probability: 0.5,
  seed: 42,
  sampleSize: 30,
  sourceDistribution: "exponential",
  prior: 0.01,
  sensitivity: 0.99,
  specificity: 0.95,
};

export const PROBABILITY_SCHEMA: Record<keyof ProbabilityParams, FieldSchema> = {
  experiment: { type: "string", options: ["coin", "dice", "lln", "clt", "bayes"] },
  trials: { type: "integer", min: 10, max: 100000 },
  probability: { type: "number", min: 0, max: 1 },
  seed: { type: "integer", min: 0, max: 4_294_967_295 },
  sampleSize: { type: "integer", min: 1, max: 200 },
  sourceDistribution: { type: "string", options: ["uniform", "exponential", "bernoulli", "bimodal"] },
  prior: { type: "number", min: 0.0001, max: 0.999 },
  sensitivity: { type: "number", min: 0.5, max: 0.9999 },
  specificity: { type: "number", min: 0.5, max: 0.9999 },
};

export const PROBABILITY_LABELS: Record<keyof ProbabilityParams, string> = {
  experiment: "Experiment",
  trials: "Number of trials",
  probability: "P(heads)",
  seed: "Random seed",
  sampleSize: "Sample size n",
  sourceDistribution: "Source distribution",
  prior: "Prior probability",
  sensitivity: "Sensitivity P(+|disease)",
  specificity: "Specificity P(−|healthy)",
};

export const EXPERIMENT_LABELS: Record<Experiment, string> = {
  coin: "Coin flips",
  dice: "Dice sums",
  lln: "Law of large numbers",
  clt: "Central limit theorem",
  bayes: "Bayes' theorem",
};
