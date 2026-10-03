import { PcaLab } from "./PcaLab";
import { getLab } from "@/content/labs";
import { parseConfigFromParams } from "@/lib/experiment/config";
import { PCA_DEFAULTS, PCA_SCHEMA, type PcaParams } from "@/lib/labs/pca";
import { notFound } from "next/navigation";

export const metadata = {
  title: "PCA & Factor Lab",
  description:
    "Principal component analysis on yield curves and asset returns — watch a mechanical procedure recover level, slope and curvature, and the market factor, without being told they exist.",
};

export default async function PcaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lab = getLab("pca");
  if (!lab) notFound();

  const resolved = await searchParams;
  const initialParams = parseConfigFromParams<PcaParams & Record<string, never>>(
    resolved,
    PCA_SCHEMA,
    PCA_DEFAULTS as PcaParams & Record<string, never>,
  );

  return <PcaLab lab={lab} initialParams={initialParams} />;
}
