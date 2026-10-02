import Link from "next/link";
import { DIFFICULTY_SHORT, type LabMeta } from "@/content/labs";
import { Badge } from "@/components/ui";

const difficultyTone: Record<number, "neutral" | "accent" | "caution" | "negative"> = {
  1: "neutral",
  2: "accent",
  3: "caution",
  4: "negative",
};

export function LabCard({ lab }: { lab: LabMeta }) {
  const planned = lab.status === "planned";

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-snug tracking-tight text-ink">{lab.title}</h3>
        <Badge tone={difficultyTone[lab.difficulty]}>L{lab.difficulty}</Badge>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{lab.tagline}</p>

      <ul className="mt-3 flex flex-wrap gap-1">
        {lab.concepts.slice(0, 3).map((concept) => (
          <li
            key={concept}
            className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-2xs text-ink-faint"
          >
            {concept}
          </li>
        ))}
        {lab.concepts.length > 3 ? (
          <li className="px-1 py-0.5 text-2xs text-ink-faint">+{lab.concepts.length - 3} more</li>
        ) : null}
      </ul>

      <div className="mt-3 flex items-center gap-3 border-t border-line pt-2.5 text-2xs text-ink-faint">
        <span>{DIFFICULTY_SHORT[lab.difficulty]}</span>
        <span aria-hidden="true">·</span>
        <span>~{lab.minutes} min</span>
        {planned ? (
          <span className="ml-auto font-medium text-caution">Planned</span>
        ) : (
          <span className="ml-auto font-medium text-accent transition-transform group-hover:translate-x-0.5">
            Open lab →
          </span>
        )}
      </div>
    </>
  );

  if (planned) {
    return (
      <div className="rounded-card border border-dashed border-line bg-surface/60 p-4 opacity-70">{content}</div>
    );
  }

  return (
    <Link
      href={`/labs/${lab.slug}`}
      className="group block rounded-card border border-line bg-surface p-4 transition-all hover:border-line-strong hover:bg-surface-raised"
    >
      {content}
    </Link>
  );
}
