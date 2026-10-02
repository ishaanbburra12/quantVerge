import type { FieldSchema } from "@/lib/experiment/config";

export type ReturnProcess = "gbm" | "regime" | "jump" | "studentt";

export interface RiskParams {
  process: ReturnProcess;
  drift: number;
  volatility: number;
  steps: number;
  seed: number;
  confidence: number;
  riskFreeRate: number;
  /** Intensity of the tail-generating mechanism, meaning depends on process. */
  tailParam: number;
  monteCarloRuns: number;
}

export const RISK_DEFAULTS: RiskParams = {
  process: "gbm",
  drift: 0.08,
  volatility: 0.2,
  steps: 1260,
  seed: 42,
  confidence: 0.95,
  riskFreeRate: 0.03,
  tailParam: 0.3,
  monteCarloRuns: 20000,
};

export const RISK_SCHEMA: Record<keyof RiskParams, FieldSchema> = {
  process: { type: "string", options: ["gbm", "regime", "jump", "studentt"] },
  drift: { type: "number", min: -0.5, max: 0.5 },
  volatility: { type: "number", min: 0.01, max: 1 },
  steps: { type: "integer", min: 252, max: 5040 },
  seed: { type: "integer", min: 0, max: 4_294_967_295 },
  confidence: { type: "number", min: 0.5, max: 0.999 },
  riskFreeRate: { type: "number", min: 0, max: 0.2 },
  tailParam: { type: "number", min: 0, max: 1 },
  monteCarloRuns: { type: "integer", min: 1000, max: 200000 },
};

export const RISK_LABELS: Record<keyof RiskParams, string> = {
  process: "Return process",
  drift: "Annual drift",
  volatility: "Annual volatility",
  steps: "Trading days",
  seed: "Random seed",
  confidence: "VaR confidence level",
  riskFreeRate: "Risk-free rate",
  tailParam: "Tail intensity",
  monteCarloRuns: "Monte Carlo VaR runs",
};

export const PROCESS_LABELS: Record<ReturnProcess, string> = {
  gbm: "Geometric Brownian motion (Gaussian)",
  regime: "Regime switching (mixture of normals)",
  jump: "Jump diffusion (Merton)",
  studentt: "Student-t innovations (heavy tails)",
};

export const PROCESS_DESCRIPTIONS: Record<ReturnProcess, string> = {
  gbm: "Perfectly Gaussian log returns. This is the case where every parametric formula is exactly right, so it is the control condition — any disagreement between methods here is sampling noise, not model error.",
  regime: "Returns drawn from a calm regime most of the time and a turbulent one occasionally. Each component is normal; the mixture is not, and it produces both fat tails and volatility clustering.",
  jump: "Continuous diffusion plus occasional Poisson-timed jumps, biased downward. This generates the sudden gaps that a continuous model structurally cannot.",
  studentt: "Innovations drawn from a Student-t distribution rather than a normal. Tails decay polynomially rather than exponentially, which is the standard heavy-tailed benchmark.",
};
