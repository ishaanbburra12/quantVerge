/**
 * Monte Carlo lab parameters and schema.
 *
 * These live in their own module — not inside the `"use client"` component —
 * because the server component needs them too. When a server component imports a
 * value from a client module, Next.js replaces it with a client reference proxy
 * rather than the value itself, so the constant silently arrives as something
 * unusable. Shared plain data belongs in a shared plain module.
 */

import type { FieldSchema } from "@/lib/experiment/config";

export interface MonteCarloParams {
  initialPrice: number;
  drift: number;
  volatility: number;
  steps: number;
  simulations: number;
  horizonYears: number;
  seed: number;
}

export const MONTE_CARLO_DEFAULTS: MonteCarloParams = {
  initialPrice: 100,
  drift: 0.08,
  volatility: 0.2,
  steps: 252,
  simulations: 2000,
  horizonYears: 1,
  seed: 42,
};

/**
 * Bounds enforced on URL parameters. These are not cosmetic: `steps` and
 * `simulations` together determine how much work the browser is asked to do, and
 * an unbounded value from a crafted link could hang the tab.
 */
export const MONTE_CARLO_SCHEMA: Record<keyof MonteCarloParams, FieldSchema> = {
  initialPrice: { type: "number", min: 0.01, max: 1_000_000 },
  drift: { type: "number", min: -1, max: 1 },
  volatility: { type: "number", min: 0, max: 3 },
  steps: { type: "integer", min: 2, max: 2520 },
  simulations: { type: "integer", min: 1, max: 50_000 },
  horizonYears: { type: "number", min: 0.01, max: 50 },
  seed: { type: "integer", min: 0, max: 4_294_967_295 },
};

export const MONTE_CARLO_LABELS: Record<keyof MonteCarloParams, string> = {
  initialPrice: "Initial price S₀",
  drift: "Annual drift μ",
  volatility: "Annual volatility σ",
  steps: "Trading days",
  simulations: "Simulations",
  horizonYears: "Horizon (years)",
  seed: "Random seed",
};
