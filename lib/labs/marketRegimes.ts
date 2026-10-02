import type { FieldSchema } from "@/lib/experiment/config";

export interface RegimeParams {
  steps: number;
  seed: number;
  bullDrift: number;
  bullVol: number;
  bearDrift: number;
  bearVol: number;
  sidewaysDrift: number;
  sidewaysVol: number;
  /** Diagonal persistence probabilities: P(stay in this regime). */
  bullPersistence: number;
  bearPersistence: number;
  sidewaysPersistence: number;
  initialPrice: number;
  detectionWindow: number;
}

export const REGIME_DEFAULTS: RegimeParams = {
  steps: 1260,
  seed: 42,
  bullDrift: 0.14,
  bullVol: 0.13,
  bearDrift: -0.18,
  bearVol: 0.34,
  sidewaysDrift: 0.01,
  sidewaysVol: 0.09,
  bullPersistence: 0.97,
  bearPersistence: 0.93,
  sidewaysPersistence: 0.95,
  initialPrice: 100,
  detectionWindow: 40,
};

export const REGIME_SCHEMA: Record<keyof RegimeParams, FieldSchema> = {
  steps: { type: "integer", min: 60, max: 5040 },
  seed: { type: "integer", min: 0, max: 4_294_967_295 },
  bullDrift: { type: "number", min: -1, max: 1 },
  bullVol: { type: "number", min: 0.01, max: 2 },
  bearDrift: { type: "number", min: -1, max: 1 },
  bearVol: { type: "number", min: 0.01, max: 2 },
  sidewaysDrift: { type: "number", min: -1, max: 1 },
  sidewaysVol: { type: "number", min: 0.01, max: 2 },
  bullPersistence: { type: "number", min: 0.5, max: 0.999 },
  bearPersistence: { type: "number", min: 0.5, max: 0.999 },
  sidewaysPersistence: { type: "number", min: 0.5, max: 0.999 },
  initialPrice: { type: "number", min: 1, max: 1_000_000 },
  detectionWindow: { type: "integer", min: 5, max: 250 },
};

export const REGIME_LABELS: Record<keyof RegimeParams, string> = {
  steps: "Trading days",
  seed: "Random seed",
  bullDrift: "Bull drift",
  bullVol: "Bull volatility",
  bearDrift: "Bear drift",
  bearVol: "Bear volatility",
  sidewaysDrift: "Sideways drift",
  sidewaysVol: "Sideways volatility",
  bullPersistence: "P(Bull → Bull)",
  bearPersistence: "P(Bear → Bear)",
  sidewaysPersistence: "P(Sideways → Sideways)",
  initialPrice: "Initial price",
  detectionWindow: "Detection window",
};

/**
 * Build a valid transition matrix from three persistence probabilities.
 *
 * The user controls only the diagonal — how likely each regime is to continue —
 * because that is the parameter with a clear interpretation (expected run length
 * is 1/(1-p)). The remaining probability mass in each row is split between the
 * two other states, in a fixed ratio, so that every row still sums to exactly 1.
 * Exposing all nine entries would let the user build an invalid matrix, and
 * would make the one parameter that actually matters harder to find.
 */
export function buildTransitionMatrix(
  bullPersistence: number,
  bearPersistence: number,
  sidewaysPersistence: number,
): number[][] {
  // Off-diagonal splits. Bull markets more often drift into sideways than crash
  // directly into bear; bear markets more often resolve into sideways.
  const bullRest = 1 - bullPersistence;
  const bearRest = 1 - bearPersistence;
  const sidewaysRest = 1 - sidewaysPersistence;
  return [
    [bullPersistence, bullRest * 0.35, bullRest * 0.65],
    [bearRest * 0.55, bearPersistence, bearRest * 0.45],
    [sidewaysRest * 0.6, sidewaysRest * 0.4, sidewaysPersistence],
  ];
}
