import Link from "next/link";
import { notFound } from "next/navigation";
import { JOURNAL_POSTS, getPost } from "@/content/journal";
import { Equation } from "@/components/math/Equation";
import { Callout } from "@/components/ui";

export function generateStaticParams() {
  return JOURNAL_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Post not found" };
  return { title: post.title, description: post.summary };
}

export default async function JournalPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-2xs text-ink-faint">
        <Link href="/research" className="transition-colors hover:text-accent">Research</Link>
        <span aria-hidden="true">/</span>
        <Link href="/research/journal" className="transition-colors hover:text-accent">Journal</Link>
      </nav>

      <header className="max-w-prose">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{post.title}</h1>
        <p className="tabular mt-2 text-2xs text-ink-faint">
          {post.date} · {post.readingMinutes} minute read
        </p>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted">{post.summary}</p>
      </header>

      <div className="mt-8 max-w-prose space-y-8">
        {post.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-sm font-semibold tracking-tight text-ink">{section.heading}</h2>
            <div className="mt-2.5 space-y-3">
              {section.paragraphs.map((paragraph, i) => (
                <p key={i} className="text-sm leading-relaxed text-ink-muted">
                  {paragraph}
                </p>
              ))}
            </div>
            {section.equation ? (
              <div className="mt-4 rounded-card border border-line bg-surface-sunken px-4 py-3">
                <Equation>{section.equation}</Equation>
                {section.equationNote ? (
                  <p className="mt-1 text-xs leading-relaxed text-ink-faint">{section.equationNote}</p>
                ) : null}
              </div>
            ) : null}
          </section>
        ))}
      </div>

      <div className="mt-10 max-w-prose">
        <Callout tone="caution" title="Reproducing these numbers">
          <p>
            Every figure quoted here came from the labs on this site at their default settings, with the seed
            stated in the{" "}
            <Link href="/research/experiment-log" className="text-accent hover:underline">experiment log</Link>.
            All data is synthetic. None of this is investment advice, and none of it is a claim about any real
            market.
          </p>
        </Callout>
      </div>
    </article>
  );
}
