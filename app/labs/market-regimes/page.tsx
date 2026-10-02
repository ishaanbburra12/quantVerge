import { RegimeLab } from "./RegimeLab";
import { getLab } from "@/content/labs";
import { parseConfigFromParams } from "@/lib/experiment/config";
import { REGIME_DEFAULTS, REGIME_SCHEMA, type RegimeParams } from "@/lib/labs/marketRegimes";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Market Regime Simulator",
  description:
    "Simulate a market that switches between hidden bull, bear and sideways regimes according to a Markov transition matrix, and try to infer the hidden state from observable data.",
};

export default async function MarketRegimesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lab = getLab("market-regimes");
  if (!lab) notFound();

  const resolved = await searchParams;
  const initialParams = parseConfigFromParams<RegimeParams & Record<string, number>>(
    resolved,
    REGIME_SCHEMA,
    REGIME_DEFAULTS as RegimeParams & Record<string, number>,
  );

  return <RegimeLab lab={lab} initialParams={initialParams} />;
}
