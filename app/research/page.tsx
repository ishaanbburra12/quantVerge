import Link from "next/link";
import { PageHeader, Section } from "@/components/PageHeader";
import { Card, CardBody, Badge, Callout } from "@/components/ui";

export const metadata = {
  title: "Research",
  description:
    "Research frameworks, experiment logs and a research journal. Results sections are marked as awaiting experiments until those experiments have actually been run.",
};

const ITEMS = [
  {
    href: "/research/rl-market-robustness",
    status: "Research in progress",
    tone: "caution" as const,
    title: "Robustness of Reinforcement Learning Trading Agents Under Distribution Shift",
    summary:
      "Which reward design produces the most robust performance when market conditions differ from the training environment? The experimental design is complete and published here; the results sections are empty because the experiments have not been run.",
  },
  {
    href: "/research/experiment-log",
    status: "Ongoing",
    tone: "accent" as const,
    title: "Experiment log",
    summary:
      "Every experiment run on this platform, including the ones that failed or produced nothing. Failed experiments stay visible — removing them is how a research record becomes a sales pitch.",
  },
  {
    href: "/research/journal",
    status: "Ongoing",
    tone: "neutral" as const,
    title: "Research journal",
    summary:
      "Working notes on what the labs revealed while building them: why backtests lie, what transaction costs do, and what makes a simulated market learnable.",
  },
  {
    href: "/references",
    status: "Reference",
    tone: "neutral" as const,
    title: "References",
    summary:
      "Sources used while building QuantLab, with verification status marked explicitly. Anything that could not be verified is labelled rather than invented.",
  },
];

export default function ResearchPage() {
  return (
    <>
      <PageHeader
        eyebrow="Research"
        title="Research"
        description="This section holds research frameworks and working notes. It is structured so that the experimental design is published before the results exist, which is the order that makes a result credible."
      />

      <Section>
        <Callout tone="caution" title="On what is and is not here">
          <p>
            The reinforcement-learning study below is published as an <strong className="text-ink">experimental
            design</strong>, not as a finding. Its research question, hypotheses, state and action spaces,
            reward functions, shift conditions and evaluation metrics are all specified. Its results sections
            are explicitly empty.
          </p>
          <p>
            This ordering is deliberate. Specifying the analysis before seeing the data is what prevents the
            most common failure in empirical research: adjusting the design after the fact until the
            conclusion comes out favourably. Nothing on this page reports an outcome that has not been
            measured.
          </p>
        </Callout>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="group block">
              <Card className="h-full transition-colors group-hover:border-line-strong">
                <CardBody>
                  <Badge tone={item.tone}>{item.status}</Badge>
                  <h2 className="mt-2.5 text-sm font-semibold leading-snug tracking-tight text-ink group-hover:text-accent">
                    {item.title}
                  </h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{item.summary}</p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
