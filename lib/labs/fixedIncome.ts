import type { FieldSchema } from "@/lib/experiment/config";

export interface FixedIncomeParams {
  faceValue: number;
  couponRate: number;
  maturity: number;
  frequency: number;
  yieldRate: number;
  yieldShock: number;
  curveShape: "normal" | "flat" | "inverted" | "humped";
}

export const FIXED_INCOME_DEFAULTS: FixedIncomeParams = {
  faceValue: 100,
  couponRate: 0.05,
  maturity: 10,
  frequency: 2,
  yieldRate: 0.05,
  yieldShock: 0.01,
  curveShape: "normal",
};

export const FIXED_INCOME_SCHEMA: Record<keyof FixedIncomeParams, FieldSchema> = {
  faceValue: { type: "number", min: 1, max: 1_000_000 },
  couponRate: { type: "number", min: 0, max: 0.3 },
  maturity: { type: "number", min: 0.5, max: 50 },
  frequency: { type: "integer", min: 1, max: 12 },
  yieldRate: { type: "number", min: -0.02, max: 0.4 },
  yieldShock: { type: "number", min: -0.05, max: 0.05 },
  curveShape: { type: "string", options: ["normal", "flat", "inverted", "humped"] },
};

export const FIXED_INCOME_LABELS: Record<keyof FixedIncomeParams, string> = {
  faceValue: "Face value",
  couponRate: "Coupon rate",
  maturity: "Maturity (years)",
  frequency: "Coupons per year",
  yieldRate: "Yield to maturity",
  yieldShock: "Yield shock",
  curveShape: "Yield curve shape",
};

export const CURVE_LABELS: Record<FixedIncomeParams["curveShape"], string> = {
  normal: "Normal — upward sloping",
  flat: "Flat",
  inverted: "Inverted — short above long",
  humped: "Humped — peak in the middle",
};
