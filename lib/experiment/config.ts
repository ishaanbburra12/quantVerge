/**
 * Reproducibility layer.
 *
 * An experiment that cannot be repeated is an anecdote. Every lab therefore
 * exposes its complete parameter set as a serialisable object, which can be
 *
 *   - encoded into the URL, so a link reproduces the exact experiment;
 *   - copied to the clipboard as readable text;
 *   - exported as JSON or CSV;
 *   - stamped with a deterministic experiment ID.
 *
 * The ID is a hash of the parameters, so the same configuration always produces
 * the same ID and two people can confirm they ran the identical experiment.
 */

export type ConfigValue = number | string | boolean;
export type ExperimentConfig = Record<string, ConfigValue>;

/**
 * FNV-1a, a small non-cryptographic hash. We need determinism and a short
 * readable output, not collision resistance against an adversary.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // The multiply is written as shifts to stay inside 32-bit integer maths,
    // since JS numbers are float64 and a direct multiply would lose precision.
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash >>> 0;
}

/**
 * A stable experiment ID of the form `MC-7F3A91`.
 *
 * Keys are sorted before hashing so that the ID depends on the VALUES, not on
 * the order the object happened to be constructed in.
 */
export function experimentId(prefix: string, config: ExperimentConfig): string {
  const canonical = Object.keys(config)
    .sort()
    .map((key) => `${key}=${String(config[key])}`)
    .join("&");
  return `${prefix}-${fnv1a(canonical).toString(16).toUpperCase().padStart(6, "0").slice(0, 6)}`;
}

/** Encode a config as URL query parameters. */
export function configToQuery(config: ExperimentConfig): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(config)) params.set(key, String(value));
  return params.toString();
}

/**
 * Read a config back out of URL parameters, validating each field.
 *
 * This is the one place in the app that handles genuinely untrusted input — a
 * URL can say anything, including `volatility=-5` or `steps=1e9`. Each value is
 * therefore parsed, range-checked against the schema, and silently replaced with
 * the default if it fails. A malformed link degrades to the default experiment
 * rather than producing a broken page or a hung tab.
 */
export interface FieldSchema {
  type: "number" | "integer" | "boolean" | "string";
  min?: number;
  max?: number;
  options?: string[];
}

export function parseConfigFromParams<T extends ExperimentConfig>(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  schema: Record<keyof T, FieldSchema>,
  defaults: T,
): T {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const result = { ...defaults };
  for (const key of Object.keys(schema) as (keyof T)[]) {
    const raw = get(String(key));
    if (raw === undefined || raw === "") continue;
    const field = schema[key];

    if (field.type === "boolean") {
      if (raw === "true" || raw === "1") (result[key] as ConfigValue) = true;
      else if (raw === "false" || raw === "0") (result[key] as ConfigValue) = false;
      continue;
    }

    if (field.type === "string") {
      if (!field.options || field.options.includes(raw)) (result[key] as ConfigValue) = raw;
      continue;
    }

    const parsed = Number(raw);
    // Reject NaN and Infinity, both of which would propagate through every
    // downstream calculation and blank the charts.
    if (!Number.isFinite(parsed)) continue;
    if (field.type === "integer" && !Number.isInteger(parsed)) continue;
    if (field.min !== undefined && parsed < field.min) continue;
    if (field.max !== undefined && parsed > field.max) continue;
    (result[key] as ConfigValue) = parsed;
  }
  return result;
}

/** Human-readable configuration text, for the clipboard. */
export function configToText(
  title: string,
  config: ExperimentConfig,
  labels: Record<string, string> = {},
  id?: string,
): string {
  const lines = [`${title}`];
  if (id) lines.push(`Experiment ID: ${id}`);
  lines.push(`Generated: ${new Date().toISOString()}`, "");
  for (const [key, value] of Object.entries(config)) {
    lines.push(`${labels[key] ?? key}: ${value}`);
  }
  lines.push("", "Reproduce by entering these values into the same lab in QuantLab.");
  return lines.join("\n");
}

/** Convert rows of records to CSV, quoting correctly. */
export function toCSV(rows: Record<string, string | number | null>[], columns?: string[]): string {
  if (rows.length === 0) return "";
  const keys = columns ?? Object.keys(rows[0]);
  const escape = (value: string | number | null): string => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    // Quote whenever the value could otherwise break the row structure.
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [keys.join(",")];
  for (const row of rows) lines.push(keys.map((k) => escape(row[k])).join(","));
  return lines.join("\n");
}

/** Trigger a client-side file download without a server round-trip. */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoking frees the blob; without this the data stays in memory for the
  // lifetime of the document.
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The Clipboard API requires a secure context and a user gesture, and can be
    // blocked by permissions policy. Fall back to a hidden textarea.
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}
