import Link from "next/link";
import { MODULES, LESSONS, getLesson } from "@/content/lessons";
import { PageHeader, Section } from "@/components/PageHeader";
import { Card, CardBody, Badge } from "@/components/ui";

export const metadata = {
  title: "Learn",
  description:
    "Ten modules in dependency order, from probability and returns through to reinforcement learning. Every lesson has a definition, the intuition, the formula, a worked example and an interactive demonstration.",
};

export default function LearnPage() {
  return (
    <>
      <PageHeader
        eyebrow="Learn"
        title="Ten modules, in dependency order"
        description="Each module assumes only what came before it. The sequence deliberately puts reinforcement learning last, because it depends on everything else — probability, simulation, time series, backtesting and generalisation. Working through them out of order is possible but harder."
        meta={
          <>
            <Badge tone="neutral">{LESSONS.length} lessons</Badge>
            <Badge tone="accent">{MODULES.length} modules</Badge>
          </>
        }
      />

      <Section>
        <div className="space-y-5">
          {MODULES.map((module) => (
            <Card key={module.number}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="tabular text-2xs font-semibold text-accent">
                        Module {String(module.number).padStart(2, "0")}
                      </span>
                      <h2 className="text-sm font-semibold tracking-tight text-ink">{module.title}</h2>
                    </div>
                    <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-ink-muted">{module.summary}</p>
                  </div>
                  <span className="tabular shrink-0 text-2xs text-ink-faint">
                    {module.lessons.length} lesson{module.lessons.length === 1 ? "" : "s"}
                  </span>
                </div>

                <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {module.lessons.map((slug) => {
                    const lesson = getLesson(slug);
                    if (!lesson) return null;
                    return (
                      <li key={slug}>
                        <Link
                          href={`/learn/${slug}`}
                          className="group block h-full rounded-card border border-line bg-surface-sunken px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-surface-raised"
                        >
                          <p className="text-xs font-medium text-ink group-hover:text-accent">{lesson.title}</p>
                          <p className="mt-1 line-clamp-2 text-2xs leading-relaxed text-ink-faint">
                            {lesson.definition}
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </CardBody>
            </Card>
          ))}
        </div>

        <Card className="mt-6">
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">Code walkthroughs</h2>
              <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-ink-muted">
                The lessons above explain the mathematics. The walkthroughs explain the code that implements
                it — what every variable means, which failure modes return a plausible wrong answer rather than
                an error, three questions you should be able to answer aloud, and a quiz per module.
              </p>
            </div>
            <Link
              href="/learn/notes"
              className="shrink-0 rounded-md border border-accent bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink transition-all hover:brightness-110"
            >
              Open walkthroughs
            </Link>
          </CardBody>
        </Card>

        <Card className="mt-4">
          <CardBody>
            <h2 className="text-sm font-semibold text-ink">A note on the order</h2>
            <p className="mt-2 max-w-prose text-xs leading-relaxed text-ink-muted">
              It is tempting to start at Module 10. Resist it. Reinforcement learning applied to markets fails
              in ways that are invisible unless you already understand overfitting, distribution shift, and why
              a backtest can look convincing while containing no signal at all. Those are Modules 7 and 8, and
              they in turn depend on knowing what a Sharpe ratio&rsquo;s standard error looks like — which is
              Module 4, which needs Module 1.
            </p>
            <p className="mt-2 max-w-prose text-xs leading-relaxed text-ink-muted">
              The fastest route to understanding RL in finance genuinely does run through expected value and
              variance first.
            </p>
          </CardBody>
        </Card>
      </Section>
    </>
  );
}
