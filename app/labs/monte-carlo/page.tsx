import { MonteCarloLab } from "./MonteCarloLab";
import { getLab } from "@/content/labs";
import { parseConfigFromParams } from "@/lib/experiment/config";
import { MONTE_CARLO_DEFAULTS, MONTE_CARLO_SCHEMA, type MonteCarloParams } from "@/lib/labs/monteCarlo";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Monte Carlo Market Simulator",
  description:
    "Simulate thousands of geometric Brownian motion price paths, read the resulting distribution, and see where the model's assumptions break down.",
};

/**
 * Configuration arrives through the URL so an experiment can be shared as a
 * link. Values are validated against the schema before use — a URL is untrusted
 * input, and `?volatility=-99` or `?simulations=1e9` must not be able to produce
 * a broken page or a hung tab.
 */
export default async function MonteCarloPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lab = getLab("monte-carlo");
  if (!lab) notFound();

  const resolved = await searchParams;
  const initialParams = parseConfigFromParams<MonteCarloParams & Record<string, number>>(
    resolved,
    MONTE_CARLO_SCHEMA,
    MONTE_CARLO_DEFAULTS as MonteCarloParams & Record<string, number>,
  );

  return <MonteCarloLab lab={lab} initialParams={initialParams} />;
}
