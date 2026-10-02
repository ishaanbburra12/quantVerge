"use client";

import { useState, type ReactNode } from "react";
import { useResearchMode } from "@/components/providers/ResearchModeProvider";

/**
 * The nine-part experiment structure that every lab follows:
 *
 *   Question -> Inputs -> Model -> Assumptions -> Simulation -> Visualisation
 *            -> Results -> Interpretation -> Limitations
 *
 * Enforcing it as a component rather than a convention means no lab can quietly
 * skip the uncomfortable sections. Assumptions and Limitations are not optional
 * extras; they are the part that distinguishes a model from a claim.
 */
export type SectionKind =
  | "question"
  | "inputs"
  | "model"
  | "assumptions"
  | "simulation"
  | "visualisation"
  | "results"
  | "interpretation"
  | "limitations";

const sectionMeta: Record<SectionKind, { label: string; numeral: string; researchOnly?: boolean }> = {
  question: { label: "Question", numeral: "01" },
  inputs: { label: "Inputs", numeral: "02" },
  model: { label: "Model", numeral: "03", researchOnly: true },
  assumptions: { label: "Assumptions", numeral: "04", researchOnly: true },
  simulation: { label: "Simulation", numeral: "05" },
  visualisation: { label: "Visualisation", numeral: "06" },
  results: { label: "Results", numeral: "07" },
  interpretation: { label: "Interpretation", numeral: "08" },
  limitations: { label: "Limitations", numeral: "09" },
};

export function ExperimentSection({
  kind,
  title,
  children,
  defaultOpen = true,
  collapsible = false,
}: {
  kind: SectionKind;
  title?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  collapsible?: boolean;
}) {
  const meta = sectionMeta[kind];
  const { researchMode } = useResearchMode();

  // `null` means "the user has not expressed a preference for this section", in
  // which case we fall back to the mode-dependent default. Once they click, their
  // choice wins and stays put even if they later toggle Research Mode.
  const [userPreference, setUserPreference] = useState<boolean | null>(null);

  const isCollapsible = collapsible || Boolean(meta.researchOnly);

  // Model and Assumptions are always PRESENT in the page, but folded shut
  // outside Research Mode so a beginner is not met with a wall of notation
  // before they have touched a slider. They remain one click away.
  const defaultState = meta.researchOnly ? researchMode : defaultOpen;
  const isOpen = isCollapsible ? (userPreference ?? defaultState) : true;

  return (
    <section aria-labelledby={`section-${kind}`} className="scroll-mt-20">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="tabular text-2xs font-semibold text-ink-faint">{meta.numeral}</span>
        <h2 id={`section-${kind}`} className="text-xs font-semibold uppercase tracking-[0.13em] text-ink-muted">
          {title ?? meta.label}
        </h2>
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
        {isCollapsible ? (
          <button
            type="button"
            onClick={() => setUserPreference(!isOpen)}
            aria-expanded={isOpen}
            className="text-2xs font-medium text-ink-faint transition-colors hover:text-accent"
          >
            {isOpen ? "Hide" : "Show"}
          </button>
        ) : null}
      </div>
      {isOpen ? <div className="animate-fade-in">{children}</div> : null}
    </section>
  );
}

/** Wraps content that only appears in Research Mode. */
export function ResearchOnly({ children }: { children: ReactNode }) {
  const { researchMode } = useResearchMode();
  if (!researchMode) return null;
  return <div className="animate-fade-in">{children}</div>;
}

/**
 * The research-integrity triad. Keeping these three visually distinct is a
 * discipline, not decoration: an observation is what the numbers say, an
 * interpretation is what you think it means, and a conclusion is a claim you are
 * prepared to defend. Collapsing them is how "the backtest returned 40%" becomes
 * "this strategy makes 40%".
 */
export function FindingBlock({
  observation,
  interpretation,
  conclusion,
  limitation,
}: {
  observation: ReactNode;
  interpretation: ReactNode;
  conclusion?: ReactNode;
  limitation?: ReactNode;
}) {
  const rows: { label: string; body: ReactNode; tone: string }[] = [
    { label: "Observation", body: observation, tone: "text-ink" },
    { label: "Interpretation", body: interpretation, tone: "text-ink-muted" },
  ];
  if (conclusion) rows.push({ label: "Conclusion", body: conclusion, tone: "text-ink-muted" });
  if (limitation) rows.push({ label: "Limitation", body: limitation, tone: "text-caution" });

  return (
    <dl className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-0.5 sm:grid-cols-[112px_1fr] sm:gap-3">
          <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-faint sm:pt-0.5">
            {row.label}
          </dt>
          <dd className={`text-xs leading-relaxed ${row.tone}`}>{row.body}</dd>
        </div>
      ))}
    </dl>
  );
}
