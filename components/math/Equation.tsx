"use client";

import katex from "katex";
import { useMemo } from "react";

/**
 * KaTeX rendering.
 *
 * `katex.renderToString` is called with `throwOnError: false` so that a
 * malformed expression degrades to visible red source text instead of crashing
 * the page. The output is trusted here because every expression in QuantLab is
 * authored in this repository — none of it comes from user input — and KaTeX's
 * own output is HTML-escaped.
 */
function render(expression: string, displayMode: boolean): string {
  return katex.renderToString(expression, {
    displayMode,
    throwOnError: false,
    errorColor: "var(--negative)",
    strict: false,
    trust: false,
  });
}

export function Equation({ children, className = "" }: { children: string; className?: string }) {
  const html = useMemo(() => render(children, true), [children]);
  return (
    <div
      className={`overflow-x-auto text-ink ${className}`}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function InlineMath({ children }: { children: string }) {
  const html = useMemo(() => render(children, false), [children]);
  return (
    <span
      className="text-ink"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * An equation with its symbols explained underneath.
 *
 * Presenting a formula without a legend is the most common way technical writing
 * fails a learner: the reader can see the shape of the expression but has no way
 * in. Every equation in QuantLab that introduces new notation carries one.
 */
export function EquationBlock({
  equation,
  description,
  where,
  label,
}: {
  equation: string;
  description?: string;
  where?: { symbol: string; meaning: string }[];
  label?: string;
}) {
  return (
    <figure className="rounded-card border border-line bg-surface-sunken px-4 py-3">
      {label ? (
        <figcaption className="mb-1 text-2xs font-medium uppercase tracking-wider text-ink-faint">
          {label}
        </figcaption>
      ) : null}
      <Equation>{equation}</Equation>
      {description ? <p className="mt-1 text-xs leading-relaxed text-ink-muted">{description}</p> : null}
      {where && where.length > 0 ? (
        <dl className="mt-2.5 space-y-1 border-t border-line pt-2.5">
          {where.map((item) => (
            <div key={item.symbol} className="flex gap-2 text-xs leading-relaxed">
              <dt className="shrink-0 pt-px">
                <InlineMath>{item.symbol}</InlineMath>
              </dt>
              <dd className="text-ink-muted">{item.meaning}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </figure>
  );
}
