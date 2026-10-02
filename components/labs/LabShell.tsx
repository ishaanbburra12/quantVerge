"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Badge, Button, Card, CardBody, CardHeader, DataTable } from "@/components/ui";
import { useResearchMode } from "@/components/providers/ResearchModeProvider";
import {
  configToQuery, configToText, copyToClipboard, downloadFile, experimentId,
  type ExperimentConfig,
} from "@/lib/experiment/config";
import { DIFFICULTY_LABELS, type LabMeta } from "@/content/labs";

/**
 * The shell every lab page sits inside: title block, difficulty, concepts, and
 * the reproducibility panel.
 */
export function LabShell({
  lab,
  question,
  children,
}: {
  lab: LabMeta;
  question: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-content px-4 py-8 sm:px-6 sm:py-10">
          <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-2xs text-ink-faint">
            <Link href="/labs" className="transition-colors hover:text-accent">
              Labs
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-ink-muted">{lab.category}</span>
          </nav>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{lab.title}</h1>
              <p className="mt-2.5 max-w-prose text-sm leading-relaxed text-ink-muted">{lab.description}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Badge tone="accent">{DIFFICULTY_LABELS[lab.difficulty]}</Badge>
            <Badge tone="neutral">~{lab.minutes} min</Badge>
            {lab.concepts.map((concept) => (
              <span
                key={concept}
                className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-2xs text-ink-faint"
              >
                {concept}
              </span>
            ))}
          </div>

          <div className="mt-6 rounded-card border-l-2 border-accent bg-accent-muted/10 px-4 py-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-accent">The question</p>
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink">{question}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-content space-y-10 px-4 py-9 sm:px-6 sm:py-11">{children}</div>
    </>
  );
}

/**
 * The reproducibility panel: experiment ID, seed, a copyable configuration, a
 * shareable URL and data exports.
 *
 * This is deliberately prominent rather than tucked away. An experiment whose
 * configuration cannot be recovered is not reproducible, and reproducibility is
 * the difference between an experiment and a demonstration.
 */
export function ReproducibilityPanel({
  title,
  prefix,
  config,
  labels = {},
  exports = [],
  basePath,
}: {
  title: string;
  prefix: string;
  config: ExperimentConfig;
  labels?: Record<string, string>;
  exports?: { label: string; filename: string; mime: string; build: () => string }[];
  basePath: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const { researchMode } = useResearchMode();
  const id = experimentId(prefix, config);

  const announce = (message: string) => {
    setCopied(message);
    window.setTimeout(() => setCopied(null), 2200);
  };

  const copyConfig = async () => {
    const ok = await copyToClipboard(configToText(title, config, labels, id));
    announce(ok ? "Configuration copied" : "Copy failed — your browser blocked clipboard access");
  };

  const copyLink = async () => {
    const url = `${window.location.origin}${basePath}?${configToQuery(config)}`;
    const ok = await copyToClipboard(url);
    announce(ok ? "Shareable link copied" : "Copy failed — your browser blocked clipboard access");
  };

  return (
    <Card>
      <CardHeader
        title="Reproducibility"
        subtitle="Every number on this page follows from these inputs. Same configuration, same result."
        actions={<Badge tone="neutral">{id}</Badge>}
      />
      <CardBody>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={copyConfig}>
            Copy configuration
          </Button>
          <Button size="sm" onClick={copyLink}>
            Copy shareable link
          </Button>
          {exports.map((item) => (
            <Button
              key={item.label}
              size="sm"
              variant="ghost"
              onClick={() => downloadFile(item.filename, item.build(), item.mime)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        {/* A polite live region so the confirmation is announced, not just shown. */}
        <p role="status" aria-live="polite" className="mt-2 min-h-[1rem] text-2xs text-accent">
          {copied}
        </p>

        {researchMode ? (
          <div className="mt-3 border-t border-line pt-3">
            <DataTable
              columns={["Parameter", "Value"]}
              align={["left", "right"]}
              rows={Object.entries(config).map(([key, value]) => [
                labels[key] ?? key,
                <span key={key} className="tabular">
                  {String(value)}
                </span>,
              ])}
              caption="Full parameter set for this run."
            />
          </div>
        ) : (
          <p className="mt-2 text-2xs leading-relaxed text-ink-faint">
            Turn on <strong className="font-medium text-ink-muted">Research mode</strong> in the header to see
            the full parameter table, the derivations and the raw statistics.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/** Progress indicator for a long simulation. */
export function SimulationProgress({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-10">
      <div
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1 w-48 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-150"
          style={{ width: `${Math.max(2, progress * 100)}%` }}
        />
      </div>
      <p className="tabular text-2xs text-ink-muted">
        {label} · {Math.round(progress * 100)}%
      </p>
    </div>
  );
}
