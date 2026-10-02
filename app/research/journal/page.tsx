import Link from "next/link";
import { PageHeader, Section } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/ui";
import { JOURNAL_POSTS } from "@/content/journal";

export const metadata = {
  title: "Research journal",
  description: "Working notes from building QuantLab: why backtests lie, what transaction costs do, and what makes a market learnable.",
};

export default function JournalPage() {
  return (
    <>
      <PageHeader
        eyebrow="Research"
        title="Research journal"
        description="Notes written while building the labs, about things the simulations revealed that reading had not. Each post reports numbers that came out of the code on this site, with the configuration needed to regenerate them."
      />
      <Section>
        <div className="space-y-3">
          {JOURNAL_POSTS.map((post) => (
            <Link key={post.slug} href={`/research/journal/${post.slug}`} className="group block">
              <Card className="transition-colors group-hover:border-line-strong">
                <CardBody>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="text-sm font-semibold tracking-tight text-ink group-hover:text-accent">
                      {post.title}
                    </h2>
                    <span className="tabular shrink-0 text-2xs text-ink-faint">
                      {post.date} · {post.readingMinutes} min
                    </span>
                  </div>
                  <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-ink-muted">{post.summary}</p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
