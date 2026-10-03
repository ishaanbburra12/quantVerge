import { CreditLab } from "./CreditLab";
import { getLab } from "@/content/labs";
import { parseConfigFromParams } from "@/lib/experiment/config";
import { CREDIT_DEFAULTS, CREDIT_SCHEMA, type CreditLabParams } from "@/lib/labs/credit";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Credit Risk Lab",
  description:
    "The Merton structural model: equity as a call option on a firm's assets, and the default probabilities, credit spreads and recoveries that follow from it.",
};

export default async function CreditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lab = getLab("credit");
  if (!lab) notFound();
  const resolved = await searchParams;
  const initialParams = parseConfigFromParams<CreditLabParams & Record<string, number>>(
    resolved, CREDIT_SCHEMA, CREDIT_DEFAULTS as CreditLabParams & Record<string, number>,
  );
  return <CreditLab lab={lab} initialParams={initialParams} />;
}
