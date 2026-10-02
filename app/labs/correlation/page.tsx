import { CorrelationLab } from "./CorrelationLab";
import { getLab } from "@/content/labs";
import { parseConfigFromParams } from "@/lib/experiment/config";
import { CORRELATION_DEFAULTS, CORRELATION_SCHEMA, type CorrelationParams } from "@/lib/labs/correlation";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Correlation Lab",
  description:
    "Drag one correlation slider from −1 to +1 and watch diversification appear in the portfolio variance formula.",
};

export default async function CorrelationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lab = getLab("correlation");
  if (!lab) notFound();

  const resolved = await searchParams;
  const initialParams = parseConfigFromParams<CorrelationParams & Record<string, number>>(
    resolved,
    CORRELATION_SCHEMA,
    CORRELATION_DEFAULTS as CorrelationParams & Record<string, number>,
  );

  return <CorrelationLab lab={lab} initialParams={initialParams} />;
}
