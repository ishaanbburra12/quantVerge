import { BinomialLab } from "./BinomialLab";
import { getLab } from "@/content/labs";
import { parseConfigFromParams } from "@/lib/experiment/config";
import { BINOMIAL_DEFAULTS, BINOMIAL_SCHEMA, type BinomialLabParams } from "@/lib/labs/binomial";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Binomial Tree Lab",
  description:
    "Price options on a Cox-Ross-Rubinstein tree, watch it converge to Black-Scholes, and price the American early exercise that no closed form can express.",
};

export default async function BinomialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lab = getLab("binomial");
  if (!lab) notFound();
  const resolved = await searchParams;
  const initialParams = parseConfigFromParams<BinomialLabParams & Record<string, never>>(
    resolved, BINOMIAL_SCHEMA, BINOMIAL_DEFAULTS as BinomialLabParams & Record<string, never>,
  );
  return <BinomialLab lab={lab} initialParams={initialParams} />;
}
