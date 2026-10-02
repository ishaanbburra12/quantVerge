import type { FieldSchema } from "@/lib/experiment/config";

export interface OptionsParams {
  spot: number;
  strike: number;
  timeToExpiry: number;
  riskFreeRate: number;
  volatility: number;
  dividendYield: number;
  optionType: "call" | "put";
  simulations: number;
  seed: number;
  antithetic: number;
}

export const OPTIONS_DEFAULTS: OptionsParams = {
  spot: 100,
  strike: 100,
  timeToExpiry: 1,
  riskFreeRate: 0.05,
  volatility: 0.2,
  dividendYield: 0,
  optionType: "call",
  simulations: 20000,
  seed: 42,
  antithetic: 1,
};

export const OPTIONS_SCHEMA: Record<keyof OptionsParams, FieldSchema> = {
  spot: { type: "number", min: 0.01, max: 100_000 },
  strike: { type: "number", min: 0.01, max: 100_000 },
  timeToExpiry: { type: "number", min: 0, max: 30 },
  riskFreeRate: { type: "number", min: -0.1, max: 0.5 },
  volatility: { type: "number", min: 0, max: 3 },
  dividendYield: { type: "number", min: 0, max: 0.3 },
  optionType: { type: "string", options: ["call", "put"] },
  simulations: { type: "integer", min: 100, max: 500_000 },
  seed: { type: "integer", min: 0, max: 4_294_967_295 },
  antithetic: { type: "integer", min: 0, max: 1 },
};

export const OPTIONS_LABELS: Record<keyof OptionsParams, string> = {
  spot: "Spot price S",
  strike: "Strike price K",
  timeToExpiry: "Time to expiry T (years)",
  riskFreeRate: "Risk-free rate r",
  volatility: "Volatility σ",
  dividendYield: "Dividend yield q",
  optionType: "Option type",
  simulations: "Monte Carlo simulations",
  seed: "Random seed",
  antithetic: "Antithetic variates",
};
