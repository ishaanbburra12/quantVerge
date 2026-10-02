import { OptionsLab } from "./OptionsLab";
import { getLab } from "@/content/labs";
import { parseConfigFromParams } from "@/lib/experiment/config";
import { OPTIONS_DEFAULTS, OPTIONS_SCHEMA, type OptionsParams } from "@/lib/labs/options";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Options Lab",
  description:
    "Price European options with Black-Scholes and by Monte Carlo simulation, compare the two, and watch the simulation error shrink as the square root of the sample size.",
};

export default async function OptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lab = getLab("options");
  if (!lab) notFound();

  const resolved = await searchParams;
  const initialParams = parseConfigFromParams<OptionsParams & Record<string, never>>(
    resolved,
    OPTIONS_SCHEMA,
    OPTIONS_DEFAULTS as OptionsParams & Record<string, never>,
  );

  return <OptionsLab lab={lab} initialParams={initialParams} />;
}
