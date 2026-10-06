import Link from "next/link";
import { LandingHero } from "@/components/landing";
import { LabCard } from "@/components/LabCard";
import { LABS } from "@/content/labs";
import { Section } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/ui";

const FEATURED_SLUGS = [
  "monte-carlo", "market-regimes", "portfolio-optimizer",
  "risk-analyzer", "backtesting", "overfitting", "options", "probability",
];

const METHOD_STEPS = [
  { n: "01", label: "Question", text: "What exactly are we asking? A question that cannot be answered wrongly is not an experiment." },
  { n: "02", label: "Inputs", text: "Every parameter is visible and adjustable, including the random seed." },
  { n: "03", label: "Model", text: "The equations, written out, with every symbol defined." },
  { n: "04", label: "Assumptions", text: "What the model takes for granted — stated before the result, not after." },
  { n: "05", label: "Simulation", text: "The calculation runs in your browser. Same seed, same answer, every time." },
  { n: "06", label: "Visualisation", text: "Charts that show the distribution, not just the headline number." },
  { n: "07", label: "Results", text: "The raw statistics, exportable as CSV or JSON." },
  { n: "08", label: "Interpretation", text: "What the numbers mean, kept separate from what they say." },
  { n: "09", label: "Limitations", text: "Where this breaks. Every model in here breaks somewhere." },
];

export default function HomePage() {
  const featured = FEATURED_SLUGS.map((slug) => LABS.find((lab) => lab.slug === slug)).filter(
    (lab): lab is (typeof LABS)[number] => Boolean(lab),
  );

  return (
    <>
      <LandingHero />

      {/* ---------- What this is / is not ---------- */}
      <Section>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Everything is computed",
              body: "No hard-coded results. Every statistic on this site is calculated in your browser from the parameters you choose, by functions covered by a test suite of 457 numerical tests.",
            },
            {
              title: "Everything is reproducible",
              body: "Every experiment exposes its random seed and full configuration. Copy it, share it, or encode it in the URL, and the identical experiment runs again.",
            },
            {
              title: "Nothing is predicted",
              body: "These models describe how mathematical processes behave, not what markets will do. All data is synthetic. Where a model fails, the lab says so explicitly.",
            },
          ].map((item) => (
            <Card key={item.title}>
              <CardBody>
                <h3 className="text-sm font-semibold text-ink">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{item.body}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </Section>

      {/* ---------- Labs ---------- */}
      <Section
        title="Laboratories"
        description="Each lab is a self-contained experiment. Start anywhere, though the Level 1 labs assume the least."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((lab) => (
            <LabCard key={lab.slug} lab={lab} />
          ))}
        </div>
        <div className="mt-5">
          <Link href="/labs" className="text-xs font-medium text-accent hover:underline">
            All {LABS.length} labs, by category →
          </Link>
        </div>
      </Section>

      {/* ---------- Method ---------- */}
      <Section
        title="Every experiment follows the same nine steps"
        description="This structure is enforced by the code, not by convention. A lab cannot quietly omit its assumptions or its limitations."
      >
        <ol className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {METHOD_STEPS.map((step) => (
            <li key={step.n} className="flex gap-3 border-t border-line pt-3">
              <span className="tabular shrink-0 text-2xs font-semibold text-accent">{step.n}</span>
              <div>
                <p className="text-xs font-semibold text-ink">{step.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* ---------- Learn / research split ---------- */}
      <Section>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardBody className="flex h-full flex-col">
              <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-accent">Learn</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-ink">
                Ten modules, in dependency order
              </h3>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-ink-muted">
                Probability and returns, then Monte Carlo, then correlation, then portfolio mathematics, then
                time series, regimes, backtesting, overfitting, machine learning, and only then reinforcement
                learning. Each lesson has a definition, the intuition, the formula, a worked example, an
                interactive demonstration, and an honest note on why it matters.
              </p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
                <Link href="/learn" className="text-xs font-medium text-accent hover:underline">
                  Start with Module 1 →
                </Link>
                <Link href="/learn/notes" className="text-xs font-medium text-accent hover:underline">
                  Code walkthroughs →
                </Link>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex h-full flex-col">
              <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-accent">Research</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-ink">
                A research framework, not a results page
              </h3>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-ink-muted">
                The reinforcement-learning robustness study is published here as an experimental design:
                research question, hypothesis, state and action spaces, three reward functions, the
                distribution shifts, and the metrics. The results sections are explicitly marked as awaiting
                experiments. Nothing is reported that has not been run.
              </p>
              <Link href="/research" className="mt-4 text-xs font-medium text-accent hover:underline">
                Read the framework →
              </Link>
            </CardBody>
          </Card>
        </div>
      </Section>
    </>
  );
}
