import { GarchLab } from "./GarchLab";
import { getLab } from "@/content/labs";
import { parseConfigFromParams } from "@/lib/experiment/config";
import { GARCH_DEFAULTS, GARCH_SCHEMA, type GarchLabParams } from "@/lib/labs/garch";
import { notFound } from "next/navigation";

export const metadata = {
  title: "GARCH Volatility Lab",
  description:
    "Model volatility that changes over time, fit it by maximum likelihood, and forecast where it goes after a shock.",
};

export default async function GarchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lab = getLab("garch");
  if (!lab) notFound();
  const resolved = await searchParams;
  const initialParams = parseConfigFromParams<GarchLabParams & Record<string, number>>(
    resolved, GARCH_SCHEMA, GARCH_DEFAULTS as GarchLabParams & Record<string, number>,
  );
  return <GarchLab lab={lab} initialParams={initialParams} />;
}
