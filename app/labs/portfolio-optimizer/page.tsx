import { PortfolioLab } from "./PortfolioLab";
import { getLab } from "@/content/labs";
import { parseConfigFromParams } from "@/lib/experiment/config";
import { PORTFOLIO_DEFAULTS, PORTFOLIO_SCHEMA, type PortfolioLabParams } from "@/lib/labs/portfolio";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Portfolio Optimizer",
  description:
    "Build a portfolio of synthetic assets, set their correlations, and watch the efficient frontier emerge from thousands of random portfolios.",
};

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lab = getLab("portfolio-optimizer");
  if (!lab) notFound();

  const resolved = await searchParams;
  const initialParams = parseConfigFromParams<PortfolioLabParams & Record<string, number>>(
    resolved,
    PORTFOLIO_SCHEMA,
    PORTFOLIO_DEFAULTS as PortfolioLabParams & Record<string, number>,
  );

  return <PortfolioLab lab={lab} initialParams={initialParams} />;
}
