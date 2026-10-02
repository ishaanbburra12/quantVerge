import { RiskLab } from "./RiskLab";
import { getLab } from "@/content/labs";
import { parseConfigFromParams } from "@/lib/experiment/config";
import { RISK_DEFAULTS, RISK_SCHEMA, type RiskParams } from "@/lib/labs/risk";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Risk Analyzer",
  description:
    "Volatility, downside deviation, drawdown, Sharpe, Sortino, VaR and CVaR computed on the same return series — so the disagreements between them become the lesson.",
};

export default async function RiskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lab = getLab("risk-analyzer");
  if (!lab) notFound();

  const resolved = await searchParams;
  const initialParams = parseConfigFromParams<RiskParams & Record<string, never>>(
    resolved,
    RISK_SCHEMA,
    RISK_DEFAULTS as RiskParams & Record<string, never>,
  );

  return <RiskLab lab={lab} initialParams={initialParams} />;
}
