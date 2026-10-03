import type { FieldSchema } from "@/lib/experiment/config";

export interface BinomialLabParams {
  spot: number;
  strike: number;
  timeToExpiry: number;
  riskFreeRate: number;
  volatility: number;
  dividendYield: number;
  steps: number;
  optionType: "call" | "put";
  american: number;
}

export const BINOMIAL_DEFAULTS: BinomialLabParams = {
  spot: 100,
  strike: 100,
  timeToExpiry: 1,
  riskFreeRate: 0.05,
  volatility: 0.2,
  dividendYield: 0,
  steps: 50,
  optionType: "put",
  american: 1,
};

export const BINOMIAL_SCHEMA: Record<keyof BinomialLabParams, FieldSchema> = {
  spot: { type: "number", min: 1, max: 100000 },
  strike: { type: "number", min: 1, max: 100000 },
  timeToExpiry: { type: "number", min: 0.02, max: 10 },
  riskFreeRate: { type: "number", min: 0, max: 0.3 },
  volatility: { type: "number", min: 0.01, max: 2 },
  dividendYield: { type: "number", min: 0, max: 0.3 },
  steps: { type: "integer", min: 1, max: 1000 },
  optionType: { type: "string", options: ["call", "put"] },
  american: { type: "integer", min: 0, max: 1 },
};

export const BINOMIAL_LABELS: Record<keyof BinomialLabParams, string> = {
  spot: "Spot price S",
  strike: "Strike price K",
  timeToExpiry: "Time to expiry (years)",
  riskFreeRate: "Risk-free rate r",
  volatility: "Volatility σ",
  dividendYield: "Dividend yield q",
  steps: "Tree steps",
  optionType: "Option type",
  american: "American exercise",
};
