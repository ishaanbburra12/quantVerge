import { InferenceLab } from "./InferenceLab";
import { getLab } from "@/content/labs";
import { parseConfigFromParams } from "@/lib/experiment/config";
import { INFERENCE_DEFAULTS, INFERENCE_SCHEMA, type InferenceParams } from "@/lib/labs/inference";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Statistical Inference Lab",
  description:
    "Hypothesis testing, p-values, statistical power and multiple testing — demonstrated on data where you set the truth, so the errors can actually be counted.",
};

export default async function InferencePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lab = getLab("inference");
  if (!lab) notFound();

  const resolved = await searchParams;
  const initialParams = parseConfigFromParams<InferenceParams & Record<string, number>>(
    resolved,
    INFERENCE_SCHEMA,
    INFERENCE_DEFAULTS as InferenceParams & Record<string, number>,
  );

  return <InferenceLab lab={lab} initialParams={initialParams} />;
}
