import { PageHeader, Section } from "@/components/PageHeader";
import { Card, CardBody, Badge, Callout } from "@/components/ui";
import { EXPERIMENTS, STATUS_TONE } from "@/content/experiments";

export const metadata = {
  title: "Experiment log",
  description:
    "Every experiment run while building QuantVerge, including the failures and the ones that needed revision. Failed experiments stay visible.",
};

export default function ExperimentLogPage() {
  const counts = EXPERIMENTS.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        eyebrow="Research"
        title="Experiment log"
        description="Every experiment run while building this platform, in the order it was run. Three of the ten below are recorded as failed or needing revision, and those entries are the most useful ones here."
        meta={
          <>
            {Object.entries(counts).map(([status, count]) => (
              <Badge key={status} tone={STATUS_TONE[status as keyof typeof STATUS_TONE]}>
                {count} {status.toLowerCase()}
              </Badge>
            ))}
          </>
        }
      />

      <Section>
        <Callout tone="accent" title="Why the failures are here">
          <p>
            A log containing only successes is not a record of what happened — it is a record of what was worth
            showing afterwards, which is a different and much less useful thing. Two entries below describe
            tests that were wrong rather than code that was wrong, and one describes a bug that produced a
            plausible number instead of an error. Those are the failure modes worth learning to recognise.
          </p>
        </Callout>

        <div className="mt-6 space-y-3">
          {EXPERIMENTS.map((experiment) => (
            <Card key={experiment.id}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="tabular text-xs font-semibold text-accent">{experiment.id}</span>
                    <Badge tone={STATUS_TONE[experiment.status]}>{experiment.status}</Badge>
                  </div>
                  <span className="tabular text-2xs text-ink-faint">{experiment.date}</span>
                </div>

                <h2 className="mt-2.5 max-w-prose text-sm font-medium leading-snug text-ink">
                  {experiment.question}
                </h2>

                <dl className="mt-3 space-y-2.5">
                  <div className="grid gap-0.5 sm:grid-cols-[100px_1fr] sm:gap-3">
                    <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">Parameters</dt>
                    <dd className="tabular text-xs leading-relaxed text-ink-muted">{experiment.parameters}</dd>
                  </div>
                  <div className="grid gap-0.5 sm:grid-cols-[100px_1fr] sm:gap-3">
                    <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">Seed</dt>
                    <dd className="tabular text-xs leading-relaxed text-ink-muted">{experiment.seed}</dd>
                  </div>
                  <div className="grid gap-0.5 sm:grid-cols-[100px_1fr] sm:gap-3">
                    <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">Result</dt>
                    <dd className="text-xs leading-relaxed text-ink">{experiment.result}</dd>
                  </div>
                  <div className="grid gap-0.5 sm:grid-cols-[100px_1fr] sm:gap-3">
                    <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">Interpretation</dt>
                    <dd className="text-xs leading-relaxed text-ink-muted">{experiment.interpretation}</dd>
                  </div>
                </dl>
              </CardBody>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}
