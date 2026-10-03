import type { FieldSchema } from "@/lib/experiment/config";

export interface CreditLabParams {
  assetValue: number;
  debtFaceValue: number;
  maturity: number;
  assetVolatility: number;
  riskFreeRate: number;
  assetDrift: number;
  portfolioSize: number;
  lossGivenDefault: number;
}

export const CREDIT_DEFAULTS: CreditLabParams = {
  assetValue: 100,
  debtFaceValue: 70,
  maturity: 5,
  assetVolatility: 0.25,
  riskFreeRate: 0.04,
  assetDrift: 0.08,
  portfolioSize: 100,
  lossGivenDefault: 0.6,
};

export const CREDIT_SCHEMA: Record<keyof CreditLabParams, FieldSchema> = {
  assetValue: { type: "number", min: 1, max: 100000 },
  debtFaceValue: { type: "number", min: 0.01, max: 100000 },
  maturity: { type: "number", min: 0.1, max: 30 },
  assetVolatility: { type: "number", min: 0.01, max: 1.5 },
  riskFreeRate: { type: "number", min: 0, max: 0.3 },
  assetDrift: { type: "number", min: -0.2, max: 0.4 },
  portfolioSize: { type: "integer", min: 10, max: 500 },
  lossGivenDefault: { type: "number", min: 0, max: 1 },
};

export const CREDIT_LABELS: Record<keyof CreditLabParams, string> = {
  assetValue: "Asset value V",
  debtFaceValue: "Debt face value D",
  maturity: "Debt maturity (years)",
  assetVolatility: "Asset volatility σᵥ",
  riskFreeRate: "Risk-free rate r",
  assetDrift: "Expected asset growth μ",
  portfolioSize: "Portfolio exposures",
  lossGivenDefault: "Loss given default",
};

export const SPREAD_MATURITIES = [0.08, 0.25, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30];
