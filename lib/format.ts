/** Number and date formatting used across the application. */

export function percent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function signedPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

export function currency(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function number(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function ratio(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function compact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
}

export function integer(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

/** Tone for a metric where higher is better. */
export function toneFor(value: number, neutralBand = 0): "positive" | "negative" | "neutral" {
  if (value > neutralBand) return "positive";
  if (value < -neutralBand) return "negative";
  return "neutral";
}
