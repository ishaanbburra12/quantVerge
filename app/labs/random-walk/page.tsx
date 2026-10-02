import { RandomWalkLab } from "./RandomWalkLab";
import { getLab } from "@/content/labs";
import { parseConfigFromParams } from "@/lib/experiment/config";
import { RANDOM_WALK_DEFAULTS, RANDOM_WALK_SCHEMA, type RandomWalkParams } from "@/lib/labs/randomWalk";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Random Walk vs Market Structure",
  description:
    "Random walk, momentum, mean reversion and regime switching side by side, with the autocorrelation functions that tell them apart.",
};

export default async function RandomWalkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lab = getLab("random-walk");
  if (!lab) notFound();

  const resolved = await searchParams;
  const initialParams = parseConfigFromParams<RandomWalkParams & Record<string, never>>(
    resolved,
    RANDOM_WALK_SCHEMA,
    RANDOM_WALK_DEFAULTS as RandomWalkParams & Record<string, never>,
  );

  return <RandomWalkLab lab={lab} initialParams={initialParams} />;
}
