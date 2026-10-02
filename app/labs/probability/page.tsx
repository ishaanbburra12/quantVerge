import { ProbabilityLab } from "./ProbabilityLab";
import { getLab } from "@/content/labs";
import { parseConfigFromParams } from "@/lib/experiment/config";
import { PROBABILITY_DEFAULTS, PROBABILITY_SCHEMA, type ProbabilityParams } from "@/lib/labs/probability";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Probability Playground",
  description:
    "Coin flips, dice, Bayes' theorem, the law of large numbers and the central limit theorem — demonstrated by simulation rather than asserted.",
};

export default async function ProbabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lab = getLab("probability");
  if (!lab) notFound();

  const resolved = await searchParams;
  const initialParams = parseConfigFromParams<ProbabilityParams & Record<string, never>>(
    resolved,
    PROBABILITY_SCHEMA,
    PROBABILITY_DEFAULTS as ProbabilityParams & Record<string, never>,
  );

  return <ProbabilityLab lab={lab} initialParams={initialParams} />;
}
