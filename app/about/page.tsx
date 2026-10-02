import Link from "next/link";
import { PageHeader, Section } from "@/components/PageHeader";
import { Card, CardBody, Callout, Badge } from "@/components/ui";

export const metadata = {
  title: "About",
  description: "What QuantLab is, why it was built, and what it deliberately does not claim.",
};

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="About QuantLab"
        description="A learning platform and long-term quantitative finance project, built to understand how mathematical models of markets behave and where they break."
      />

      <Section>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card>
              <CardBody className="space-y-3">
                <h2 className="text-sm font-semibold text-ink">Why this exists</h2>
                <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
                  I built QuantLab to explore how mathematics, computer science, statistics and modelling can be
                  used to understand financial systems. The aim was never to find a trading strategy. It was to
                  understand what these models actually say, what they assume, and how to tell the difference
                  between a result and an accident.
                </p>
                <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
                  The most useful thing I found while building it is that almost every important lesson is
                  easier to learn on synthetic data. When you generate the market yourself, you know the right
                  answer — so you can check whether a method recovers it. On real data that certainty never
                  exists, and it becomes very easy to mistake a selected accident for a discovery.
                </p>
                <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
                  That is why every lab here runs on data with a known data-generating process, and why the
                  most important result on the site — the −0.005 correlation between in-sample and
                  out-of-sample performance on a market with no signal — is only meaningful because I wrote the
                  market.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="space-y-3">
                <h2 className="text-sm font-semibold text-ink">Interests</h2>
                <ul className="flex flex-wrap gap-1.5">
                  {[
                    "Quantitative finance", "Machine learning", "Mathematics", "Algorithms",
                    "Market modelling", "Reinforcement learning", "Statistics", "Software engineering",
                  ].map((interest) => (
                    <li key={interest}>
                      <Badge tone="neutral">{interest}</Badge>
                    </li>
                  ))}
                </ul>
                <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
                  The long-term direction is reinforcement learning applied to market simulation, specifically
                  the question of robustness under distribution shift. The{" "}
                  <Link href="/research/rl-market-robustness" className="text-accent hover:underline">
                    research framework
                  </Link>{" "}
                  for that is published here as a design. The experiments have not been run, and the page says
                  so.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="space-y-3">
                <h2 className="text-sm font-semibold text-ink">How it is built</h2>
                <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
                  Next.js, TypeScript, React and Tailwind, with Recharts for charting and KaTeX for notation.
                  All the mathematics is implemented from scratch in TypeScript — statistics, linear algebra,
                  distributions, option pricing, portfolio optimisation and the simulation engines — and
                  covered by a test suite that checks numerical results against known analytic values.
                </p>
                <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
                  Everything computes in the browser. There is no backend, no API keys, and no data leaves your
                  machine. Every experiment is seeded, so every number on the site can be regenerated exactly.
                </p>
              </CardBody>
            </Card>
          </div>

          <div className="space-y-4">
            <Callout tone="caution" title="What this is not">
              <p>
                I am a student learning this material, not a professional quantitative analyst. Nothing here is
                investment advice, and nothing here predicts markets.
              </p>
              <p>
                The site makes no claims about real assets, reports no live trading results, and contains no
                strategy that should be traded. Where a model works, the page says under what assumptions.
                Where it fails, the page says that too — usually at greater length.
              </p>
            </Callout>

            <Card>
              <CardBody>
                <h2 className="text-sm font-semibold text-ink">Principles</h2>
                <ul className="mt-2.5 space-y-2.5 text-xs leading-relaxed text-ink-muted">
                  {[
                    ["Everything is computed.", "No hard-coded results anywhere. Every statistic is calculated from the parameters you set."],
                    ["Everything is reproducible.", "Every experiment exposes its seed and full configuration, encodable in the URL."],
                    ["Assumptions come before results.", "Each lab states what its model takes for granted before showing what it produces."],
                    ["Failures stay visible.", "The experiment log includes the experiments that failed and the tests that were wrong."],
                    ["Observation, interpretation and conclusion are kept separate.", "What the numbers say, what I think they mean, and what I am prepared to defend are three different things."],
                    ["Nothing is claimed that was not measured.", "The research page has empty results sections because the experiments have not been run."],
                  ].map(([title, body]) => (
                    <li key={title}>
                      <strong className="text-ink">{title}</strong> {body}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <h2 className="text-sm font-semibold text-ink">Where to start</h2>
                <ul className="mt-2 space-y-1.5 text-xs">
                  {[
                    ["/learn", "The ten-module learning sequence, in dependency order"],
                    ["/labs/probability", "Probability Playground — the fewest prerequisites"],
                    ["/labs/monte-carlo", "Monte Carlo Simulator — the model everything else builds on"],
                    ["/labs/overfitting", "Overfitting Lab — the single most important result here"],
                    ["/research/experiment-log", "The experiment log, including the failures"],
                  ].map(([href, label]) => (
                    <li key={href}>
                      <Link href={href} className="text-accent hover:underline">
                        {label} →
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        </div>
      </Section>
    </>
  );
}
