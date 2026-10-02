import type { FieldSchema } from "@/lib/experiment/config";

export interface PortfolioLabParams {
  /** Expected returns and volatilities, one per asset. */
  r0: number; v0: number;
  r1: number; v1: number;
  r2: number; v2: number;
  r3: number; v3: number;
  /** Pairwise correlations (6 for 4 assets). */
  c01: number; c02: number; c03: number; c12: number; c13: number; c23: number;
  /** Portfolio weights the user has chosen. */
  w0: number; w1: number; w2: number; w3: number;
  riskFreeRate: number;
  randomPortfolios: number;
  allowShort: number;
  seed: number;
}

export const PORTFOLIO_DEFAULTS: PortfolioLabParams = {
  r0: 0.12, v0: 0.22,
  r1: 0.085, v1: 0.16,
  r2: 0.035, v2: 0.06,
  r3: 0.06, v3: 0.25,
  c01: 0.72, c02: -0.12, c03: 0.25, c12: -0.05, c13: 0.3, c23: -0.08,
  w0: 0.3, w1: 0.3, w2: 0.25, w3: 0.15,
  riskFreeRate: 0.03,
  randomPortfolios: 4000,
  allowShort: 0,
  seed: 42,
};

const RETURN_FIELD: FieldSchema = { type: "number", min: -0.5, max: 1 };
const VOL_FIELD: FieldSchema = { type: "number", min: 0.005, max: 1.5 };
const CORR_FIELD: FieldSchema = { type: "number", min: -1, max: 1 };
const WEIGHT_FIELD: FieldSchema = { type: "number", min: -3, max: 4 };

export const PORTFOLIO_SCHEMA: Record<keyof PortfolioLabParams, FieldSchema> = {
  r0: RETURN_FIELD, v0: VOL_FIELD,
  r1: RETURN_FIELD, v1: VOL_FIELD,
  r2: RETURN_FIELD, v2: VOL_FIELD,
  r3: RETURN_FIELD, v3: VOL_FIELD,
  c01: CORR_FIELD, c02: CORR_FIELD, c03: CORR_FIELD,
  c12: CORR_FIELD, c13: CORR_FIELD, c23: CORR_FIELD,
  w0: WEIGHT_FIELD, w1: WEIGHT_FIELD, w2: WEIGHT_FIELD, w3: WEIGHT_FIELD,
  riskFreeRate: { type: "number", min: 0, max: 0.2 },
  randomPortfolios: { type: "integer", min: 200, max: 20000 },
  allowShort: { type: "integer", min: 0, max: 1 },
  seed: { type: "integer", min: 0, max: 4_294_967_295 },
};

export const ASSET_NAMES = ["Growth Equity", "Value Equity", "Government Bonds", "Commodities"];
export const ASSET_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

export const PORTFOLIO_LABELS: Record<string, string> = {
  r0: "Growth Equity — expected return", v0: "Growth Equity — volatility",
  r1: "Value Equity — expected return", v1: "Value Equity — volatility",
  r2: "Government Bonds — expected return", v2: "Government Bonds — volatility",
  r3: "Commodities — expected return", v3: "Commodities — volatility",
  c01: "ρ(Growth, Value)", c02: "ρ(Growth, Bonds)", c03: "ρ(Growth, Commodities)",
  c12: "ρ(Value, Bonds)", c13: "ρ(Value, Commodities)", c23: "ρ(Bonds, Commodities)",
  w0: "Weight — Growth Equity", w1: "Weight — Value Equity",
  w2: "Weight — Government Bonds", w3: "Weight — Commodities",
  riskFreeRate: "Risk-free rate", randomPortfolios: "Random portfolios",
  allowShort: "Allow short selling", seed: "Random seed",
};

/** Rebuild the symmetric correlation matrix from the six free parameters. */
export function correlationMatrixFrom(p: PortfolioLabParams): number[][] {
  return [
    [1, p.c01, p.c02, p.c03],
    [p.c01, 1, p.c12, p.c13],
    [p.c02, p.c12, 1, p.c23],
    [p.c03, p.c13, p.c23, 1],
  ];
}
