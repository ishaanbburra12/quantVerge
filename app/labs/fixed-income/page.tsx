import { FixedIncomeLab } from "./FixedIncomeLab";
import { getLab } from "@/content/labs";
import { parseConfigFromParams } from "@/lib/experiment/config";
import { FIXED_INCOME_DEFAULTS, FIXED_INCOME_SCHEMA, type FixedIncomeParams } from "@/lib/labs/fixedIncome";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Fixed Income Lab",
  description:
    "Bond pricing, duration, convexity and yield curves — why a bond with certain cash flows is still risky, and how precisely one number predicts its response to rate moves.",
};

export default async function FixedIncomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lab = getLab("fixed-income");
  if (!lab) notFound();

  const resolved = await searchParams;
  const initialParams = parseConfigFromParams<FixedIncomeParams & Record<string, never>>(
    resolved,
    FIXED_INCOME_SCHEMA,
    FIXED_INCOME_DEFAULTS as FixedIncomeParams & Record<string, never>,
  );

  return <FixedIncomeLab lab={lab} initialParams={initialParams} />;
}
