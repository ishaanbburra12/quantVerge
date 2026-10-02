import Link from "next/link";
import { PageHeader, Section } from "@/components/PageHeader";
import { Card, CardBody, Badge, Callout } from "@/components/ui";
import { TEACHING_NOTES } from "@/content/teaching";

export const metadata = {
  title: "Code walkthroughs",
  description:
    "For each module: what the code does, why the mathematics works, what every variable means, where it breaks, three questions you should be able to answer, and a quiz.",
};

export default function TeachingNotesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Learn"
        title="Code walkthroughs"
        description="The lessons explain the mathematics. These explain the code that implements it — including the failure modes that return a plausible wrong answer rather than an error, which are the ones worth learning to recognise."
        meta={
          <>
            <Badge tone="neutral">{TEACHING_NOTES.length} walkthroughs</Badge>
            <Badge tone="accent">{TEACHING_NOTES.length * 3} questions with answers</Badge>
            <Badge tone="neutral">{TEACHING_NOTES.length * 5} quiz problems</Badge>
          </>
        }
      />

      <Section>
        <Callout tone="accent" title="How to use these">
          <p>
            Read the walkthrough, then cover the answers and try the three questions aloud. They are phrased
            the way someone technical would actually ask them, and being able to answer without notes is the
            test of whether you understand the code or have merely read it.
          </p>
          <p>
            The quiz at the end has no answers printed. That is deliberate — work them out, and check your
            reasoning against the relevant lab, which computes the same quantities live.
          </p>
        </Callout>

        <div className="mt-6 space-y-3">
          {TEACHING_NOTES.map((note) => (
            <Link key={note.module} href={`/learn/notes/${note.module}`} className="group block">
              <Card className="transition-colors group-hover:border-line-strong">
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span className="tabular text-2xs font-semibold text-accent">
                          Module {String(note.module).padStart(2, "0")}
                        </span>
                        <h2 className="text-sm font-semibold tracking-tight text-ink group-hover:text-accent">
                          {note.title}
                        </h2>
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">{note.feature}</p>
                      <p className="mt-2 max-w-prose text-xs leading-relaxed text-ink-faint">
                        {note.beforeMovingOn}
                      </p>
                    </div>
                    <span className="tabular shrink-0 text-2xs text-ink-faint">
                      {note.files.length} file{note.files.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
