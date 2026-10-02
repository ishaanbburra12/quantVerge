import { BacktestLab } from "./BacktestLab";
import { getLab } from "@/content/labs";
import { parseConfigFromParams } from "@/lib/experiment/config";
import { BACKTEST_DEFAULTS, BACKTEST_SCHEMA, type BacktestParams } from "@/lib/labs/backtesting";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Backtesting Lab",
  description:
    "Run moving-average, momentum, mean-reversion and random strategies against synthetic markets, then watch transaction costs destroy the apparent edge.",
};

export default async function BacktestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lab = getLab("backtesting");
  if (!lab) notFound();

  const resolved = await searchParams;
  const initialParams = parseConfigFromParams<BacktestParams & Record<string, never>>(
    resolved,
    BACKTEST_SCHEMA,
    BACKTEST_DEFAULTS as BacktestParams & Record<string, never>,
  );

  return <BacktestLab lab={lab} initialParams={initialParams} />;
}
