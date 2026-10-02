import Link from "next/link";
import { notFound } from "next/navigation";
import { TEACHING_NOTES, getTeachingNote } from "@/content/teaching";
import { getModule } from "@/content/lessons";
import { Card, CardBody, CardHeader, Badge, Callout, DataTable } from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";

export function generateStaticParams() {
  return TEACHING_NOTES.map((note) => ({ module: String(note.module) }));
}

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const note = getTeachingNote(Number(module));
  if (!note) return { title: "Walkthrough not found" };
  return {
    title: `Module ${note.module} — ${note.title} walkthrough`,
    description: `What the code does, why the mathematics works, where it breaks, and three questions you should be able to answer about ${note.feature.toLowerCase()}.`,
  };
}

function Block({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="scroll-mt-20">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="tabular text-2xs font-semibold text-ink-faint">{n}</span>
        <h2 className="text-xs font-semibold uppercase tracking-[0.13em] text-ink-muted">{title}</h2>
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
      </div>
      {children}
    </section>
  );
}

export default async function TeachingNotePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const note = getTeachingNote(Number(module));
  if (!note) notFound();

  const moduleMeta = getModule(note.module);
  const previous = getTeachingNote(note.module - 1);
  const next = getTeachingNote(note.module + 1);

  return (
    <>
      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-content px-4 py-8 sm:px-6 sm:py-10">
          <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-2xs text-ink-faint">
            <Link href="/learn" className="transition-colors hover:text-accent">Learn</Link>
            <span aria-hidden="true">/</span>
            <Link href="/learn/notes" className="transition-colors hover:text-accent">Code walkthroughs</Link>
          </nav>
          <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-accent">
            Module {String(note.module).padStart(2, "0")}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{note.title}</h1>
          <p className="mt-2 text-sm text-ink-muted">{note.feature}</p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {note.files.map((file) => (
              <span
                key={file.path}
                title={file.role}
                className="tabular rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-2xs text-ink-muted"
              >
                {file.path}
              </span>
            ))}
          </div>

          {moduleMeta ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {moduleMeta.lessons.map((slug) => (
                <Link key={slug} href={`/learn/${slug}`}>
                  <Badge tone="neutral">{slug.replace(/-/g, " ")}</Badge>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-content space-y-9 px-4 py-9 sm:px-6">
        <Block n="01" title="What the code does">
          <Card>
            <CardBody>
              <p className="max-w-prose text-sm leading-relaxed text-ink-muted">{note.whatTheCodeDoes}</p>
              <dl className="mt-4 space-y-1.5 border-t border-line pt-3">
                {note.files.map((file) => (
                  <div key={file.path} className="grid gap-0.5 sm:grid-cols-[260px_1fr] sm:gap-3">
                    <dt className="tabular text-2xs text-accent">{file.path}</dt>
                    <dd className="text-xs text-ink-muted">{file.role}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </Block>

        <Block n="02" title="The mathematics">
          <Card>
            <CardBody className="space-y-3">
              <p className="max-w-prose text-sm leading-relaxed text-ink-muted">{note.mathematics.intro}</p>
              <div className="grid gap-3 md:grid-cols-2">
                {note.mathematics.equations.map((eq) => (
                  <EquationBlock key={eq.label} label={eq.label} equation={eq.latex} description={eq.note} />
                ))}
              </div>
            </CardBody>
          </Card>
        </Block>

        <Block n="03" title="Why the mathematics works">
          <div className="grid gap-3 md:grid-cols-2">
            {note.whyItWorks.map((item) => (
              <Card key={item.heading}>
                <CardHeader title={item.heading} />
                <CardBody>
                  <p className="text-xs leading-relaxed text-ink-muted">{item.body}</p>
                </CardBody>
              </Card>
            ))}
          </div>
        </Block>

        <Block n="04" title="What every variable represents">
          <Card>
            <CardBody>
              <dl className="space-y-2">
                {note.variables.map((v) => (
                  <div key={v.symbol} className="grid gap-0.5 sm:grid-cols-[150px_1fr] sm:gap-3">
                    <dt className="text-xs">
                      <InlineMath>{v.symbol}</InlineMath>
                    </dt>
                    <dd className="text-xs leading-relaxed text-ink-muted">{v.meaning}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </Block>

        <Block n="05" title="Assumptions and limitations">
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader title="What it assumes" />
              <CardBody>
                <ul className="space-y-1.5">
                  {note.assumptions.map((a) => (
                    <li key={a} className="flex gap-2 text-xs leading-relaxed text-ink-muted">
                      <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Where it breaks" />
              <CardBody>
                <ul className="space-y-1.5">
                  {note.limitations.map((l) => (
                    <li key={l} className="flex gap-2 text-xs leading-relaxed text-ink-muted">
                      <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-caution" />
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        </Block>

        <Block n="06" title="What could cause incorrect results">
          <Card>
            <CardBody>
              <p className="mb-3 max-w-prose text-xs leading-relaxed text-ink-faint">
                These are the failure modes that return a plausible number rather than an error. Those are the
                dangerous ones — a crash tells you something is wrong, a wrong answer does not.
              </p>
              <div className="grid gap-2.5 md:grid-cols-2">
                {note.failureModes.map((f) => (
                  <div key={f.title} className="rounded-card border border-negative/30 bg-negative/5 px-3 py-2.5">
                    <p className="text-xs font-semibold text-negative">{f.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">{f.body}</p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </Block>

        <Block n="07" title="Before you move on">
          <Callout tone="accent" title="You should be able to explain">
            <p>{note.beforeMovingOn}</p>
          </Callout>
        </Block>

        <Block n="08" title="Three questions you should be able to answer">
          <div className="space-y-3">
            {note.questions.map((q, i) => (
              <Card key={q.question}>
                <CardBody>
                  <div className="flex gap-2.5">
                    <span className="tabular shrink-0 text-xs font-semibold text-accent">Q{i + 1}</span>
                    <p className="text-sm font-medium leading-snug text-ink">{q.question}</p>
                  </div>
                  <details className="mt-3 border-t border-line pt-3">
                    <summary className="cursor-pointer text-2xs font-semibold uppercase tracking-wider text-ink-faint transition-colors hover:text-accent">
                      Show how to answer
                    </summary>
                    <p className="mt-2 max-w-prose text-xs leading-relaxed text-ink-muted">{q.answer}</p>
                  </details>
                </CardBody>
              </Card>
            ))}
          </div>
        </Block>

        <Block n="09" title="Quiz">
          <Card>
            <CardHeader
              title={`Module ${note.module} quiz`}
              subtitle="No answers printed. Work them out, then check against the relevant lab — it computes the same quantities live."
            />
            <CardBody>
              <ol className="space-y-2.5">
                {note.quiz.map((q, i) => (
                  <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-ink-muted">
                    <span className="tabular shrink-0 font-semibold text-accent">{i + 1}.</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </Block>

        <nav className="flex flex-wrap items-stretch justify-between gap-3 border-t border-line pt-5">
          {previous ? (
            <Link
              href={`/learn/notes/${previous.module}`}
              className="group min-w-0 flex-1 rounded-card border border-line bg-surface px-4 py-3 transition-colors hover:border-line-strong"
            >
              <p className="text-2xs text-ink-faint">Previous</p>
              <p className="mt-0.5 text-xs font-medium text-ink group-hover:text-accent">← {previous.title}</p>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
          {next ? (
            <Link
              href={`/learn/notes/${next.module}`}
              className="group min-w-0 flex-1 rounded-card border border-line bg-surface px-4 py-3 text-right transition-colors hover:border-line-strong"
            >
              <p className="text-2xs text-ink-faint">Next</p>
              <p className="mt-0.5 text-xs font-medium text-ink group-hover:text-accent">{next.title} →</p>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
        </nav>
      </div>
    </>
  );
}
