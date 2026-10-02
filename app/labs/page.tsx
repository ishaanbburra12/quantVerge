import { LABS, LAB_CATEGORIES, DIFFICULTY_LABELS, type Difficulty } from "@/content/labs";
import { LabCard } from "@/components/LabCard";
import { PageHeader, Section } from "@/components/PageHeader";
import { Badge } from "@/components/ui";

export const metadata = {
  title: "Labs",
  description: "Interactive quantitative finance experiments: Monte Carlo, market regimes, portfolio optimisation, risk, options, backtesting and overfitting.",
};

export default function LabsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Laboratories"
        title="Experiments"
        description="Ten interactive experiments covering simulation, portfolio theory, risk measurement, derivatives pricing and strategy research. Every calculation runs in your browser; every result is reproducible from its seed."
        meta={
          <>
            <Badge tone="neutral">{LABS.filter((l) => l.status === "available").length} available</Badge>
            <Badge tone="accent">All client-side</Badge>
            <Badge tone="neutral">Synthetic data</Badge>
          </>
        }
      />

      <Section>
        <div className="mb-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {([1, 2, 3, 4] as Difficulty[]).map((level) => (
            <div key={level} className="rounded-card border border-line bg-surface px-3 py-2.5">
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                {DIFFICULTY_LABELS[level]}
              </p>
              <p className="tabular mt-1 text-sm font-semibold text-ink">
                {LABS.filter((l) => l.difficulty === level).length} labs
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-10">
          {LAB_CATEGORIES.map((category) => {
            const labs = LABS.filter((lab) => lab.category === category);
            if (labs.length === 0) return null;
            return (
              <div key={category}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-sm font-semibold tracking-tight text-ink">{category}</h2>
                  <span aria-hidden="true" className="h-px flex-1 bg-line" />
                  <span className="tabular text-2xs text-ink-faint">{labs.length}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {labs.map((lab) => (
                    <LabCard key={lab.slug} lab={lab} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}
