import Link from "next/link";
import { PageHeader, Section } from "@/components/PageHeader";
import { Card, CardBody, Badge } from "@/components/ui";
import { GLOSSARY, GLOSSARY_CATEGORIES } from "@/content/glossary";

export const metadata = {
  title: "Glossary",
  description: "Definitions of the terms used throughout QuantVerge, each with a note on the caveat that matters most.",
};

export default function GlossaryPage() {
  return (
    <>
      <PageHeader
        eyebrow="Reference"
        title="Glossary"
        description="Every term used across the labs, grouped by area. Most entries carry a note on the caveat that matters most — because the definition is usually the easy part."
        meta={<Badge tone="neutral">{GLOSSARY.length} terms</Badge>}
      />

      <Section>
        <nav aria-label="Jump to category" className="mb-6 flex flex-wrap gap-1.5">
          {GLOSSARY_CATEGORIES.map((category) => (
            <a
              key={category}
              href={`#${category.toLowerCase().replace(/\s+/g, "-")}`}
              className="rounded border border-line bg-surface-raised px-2 py-1 text-2xs font-medium text-ink-muted transition-colors hover:border-accent hover:text-accent"
            >
              {category}
            </a>
          ))}
        </nav>

        <div className="space-y-8">
          {GLOSSARY_CATEGORIES.map((category) => {
            const entries = GLOSSARY.filter((e) => e.category === category).sort((a, b) =>
              a.term.localeCompare(b.term),
            );
            if (entries.length === 0) return null;
            return (
              <section key={category} id={category.toLowerCase().replace(/\s+/g, "-")} className="scroll-mt-20">
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-sm font-semibold tracking-tight text-ink">{category}</h2>
                  <span aria-hidden="true" className="h-px flex-1 bg-line" />
                  <span className="tabular text-2xs text-ink-faint">{entries.length}</span>
                </div>
                <dl className="grid gap-3 md:grid-cols-2">
                  {entries.map((entry) => (
                    <Card key={entry.term}>
                      <CardBody>
                        <dt className="text-xs font-semibold text-ink">{entry.term}</dt>
                        <dd className="mt-1 text-xs leading-relaxed text-ink-muted">{entry.definition}</dd>
                        {entry.note ? (
                          <dd className="mt-2 border-l-2 border-caution/50 pl-2.5 text-xs leading-relaxed text-ink-muted">
                            {entry.note}
                          </dd>
                        ) : null}
                        {entry.lessonSlug ? (
                          <dd className="mt-2">
                            <Link
                              href={`/learn/${entry.lessonSlug}`}
                              className="text-2xs font-medium text-accent hover:underline"
                            >
                              Full lesson →
                            </Link>
                          </dd>
                        ) : null}
                      </CardBody>
                    </Card>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
      </Section>
    </>
  );
}
