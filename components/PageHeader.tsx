import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto max-w-content px-4 py-9 sm:px-6 sm:py-12">
        {eyebrow ? (
          <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</p>
        ) : null}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">{description}</p>
        ) : null}
        {meta ? <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div> : null}
        {children}
      </div>
    </div>
  );
}

export function Section({
  title,
  description,
  children,
  id,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mx-auto max-w-content px-4 py-10 sm:px-6">
      {title ? (
        <div className="mb-5">
          <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
          {description ? (
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-muted">{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
