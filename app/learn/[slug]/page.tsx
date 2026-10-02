import Link from "next/link";
import { notFound } from "next/navigation";
import { LESSONS, MODULES, getLesson, getModule } from "@/content/lessons";
import { getLab } from "@/content/labs";
import { Card, CardBody, CardHeader, Badge, Callout } from "@/components/ui";
import { EquationBlock } from "@/components/math/Equation";

export function generateStaticParams() {
  return LESSONS.map((lesson) => ({ slug: lesson.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lesson = getLesson(slug);
  if (!lesson) return { title: "Lesson not found" };
  return { title: lesson.title, description: lesson.definition };
}

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lesson = getLesson(slug);
  if (!lesson) notFound();

  const module = getModule(lesson.module);
  const lab = lesson.demo ? getLab(lesson.demo.labSlug) : undefined;

  // Previous and next lessons in the global dependency order.
  const flatOrder = MODULES.flatMap((m) => m.lessons);
  const index = flatOrder.indexOf(lesson.slug);
  const previous = index > 0 ? getLesson(flatOrder[index - 1]) : undefined;
  const next = index < flatOrder.length - 1 ? getLesson(flatOrder[index + 1]) : undefined;

  return (
    <>
      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-content px-4 py-8 sm:px-6 sm:py-10">
          <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-2xs text-ink-faint">
            <Link href="/learn" className="transition-colors hover:text-accent">Learn</Link>
            <span aria-hidden="true">/</span>
            <span className="text-ink-muted">Module {lesson.module} — {module?.title}</span>
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{lesson.title}</h1>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">{lesson.definition}</p>

          {lesson.prerequisites.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-2xs text-ink-faint">Assumes:</span>
              {lesson.prerequisites.map((slug) => {
                const prerequisite = getLesson(slug);
                if (!prerequisite) return null;
                return (
                  <Link key={slug} href={`/learn/${slug}`}>
                    <Badge tone="neutral">{prerequisite.title}</Badge>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mt-4">
              <Badge tone="positive">No prerequisites</Badge>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-content space-y-5 px-4 py-9 sm:px-6">
        <Card>
          <CardHeader title="Intuition" />
          <CardBody>
            <p className="max-w-prose text-sm leading-relaxed text-ink-muted">{lesson.intuition}</p>
          </CardBody>
        </Card>

        {lesson.formula ? (
          <Card>
            <CardHeader title="Formula" />
            <CardBody className="space-y-3">
              <EquationBlock equation={lesson.formula} />
              {lesson.formulaNote ? (
                <p className="max-w-prose text-xs leading-relaxed text-ink-muted">{lesson.formulaNote}</p>
              ) : null}
            </CardBody>
          </Card>
        ) : lesson.formulaNote ? (
          <Card>
            <CardHeader title="A note on the mathematics" />
            <CardBody>
              <p className="max-w-prose text-xs leading-relaxed text-ink-muted">{lesson.formulaNote}</p>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Worked example" />
          <CardBody>
            <p className="text-sm font-medium text-ink">{lesson.example.prompt}</p>
            <ol className="mt-3 space-y-1.5 border-l-2 border-line pl-4">
              {lesson.example.working.map((step, i) => (
                <li key={i} className="text-xs leading-relaxed text-ink-muted">
                  {step}
                </li>
              ))}
            </ol>
            <p className="mt-3 rounded-card border border-accent-muted bg-accent-muted/10 px-3 py-2 text-xs leading-relaxed text-ink">
              <strong className="font-semibold">Answer. </strong>
              {lesson.example.answer}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Why it matters in quantitative finance" />
          <CardBody>
            <p className="max-w-prose text-sm leading-relaxed text-ink-muted">{lesson.whyItMatters}</p>
          </CardBody>
        </Card>

        {lab && lesson.demo ? (
          <Callout tone="accent" title="Interactive demonstration">
            <p>
              <Link
                href={`/labs/${lesson.demo.labSlug}${lesson.demo.query ? `?${lesson.demo.query}` : ""}`}
                className="font-medium text-accent hover:underline"
              >
                {lesson.demo.label} →
              </Link>
            </p>
            <p className="mt-1">{lab.tagline}</p>
          </Callout>
        ) : null}

        <nav className="flex flex-wrap items-stretch justify-between gap-3 border-t border-line pt-5">
          {previous ? (
            <Link
              href={`/learn/${previous.slug}`}
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
              href={`/learn/${next.slug}`}
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
