import { OverfittingLab } from "./OverfittingLab";
import { getLab } from "@/content/labs";
import { parseConfigFromParams } from "@/lib/experiment/config";
import { OVERFITTING_DEFAULTS, OVERFITTING_SCHEMA, type OverfittingParams } from "@/lib/labs/overfitting";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Overfitting Lab",
  description:
    "Search a parameter grid for the best in-sample Sharpe ratio, then evaluate the winner on data it has never seen. The generalisation gap is the whole point.",
};

export default async function OverfittingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lab = getLab("overfitting");
  if (!lab) notFound();

  const resolved = await searchParams;
  const initialParams = parseConfigFromParams<OverfittingParams & Record<string, number>>(
    resolved,
    OVERFITTING_SCHEMA,
    OVERFITTING_DEFAULTS as OverfittingParams & Record<string, number>,
  );

  return <OverfittingLab lab={lab} initialParams={initialParams} />;
}
