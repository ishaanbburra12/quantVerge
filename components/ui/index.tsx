"use client";

import { useId, useState, type ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={`rounded-card border border-line bg-surface ${className}`}>{children}</Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  id,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h3 id={id} className="text-sm font-semibold tracking-tight text-ink">
          {title}
        </h3>
        {subtitle ? <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 py-4 sm:px-5 ${className}`}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Metric card                                                         */
/* ------------------------------------------------------------------ */

export type MetricTone = "neutral" | "positive" | "negative" | "caution";

const toneClass: Record<MetricTone, string> = {
  neutral: "text-ink",
  positive: "text-positive",
  negative: "text-negative",
  caution: "text-caution",
};

export function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
  footnote,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: MetricTone;
  footnote?: string;
}) {
  return (
    <div className="rounded-card border border-line bg-surface-raised px-3 py-2.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xs font-medium uppercase tracking-wider text-ink-faint">{label}</span>
        {hint ? <InfoTip label={`About ${label}`}>{hint}</InfoTip> : null}
      </div>
      <div className={`tabular mt-1 text-lg font-semibold leading-tight ${toneClass[tone]}`}>{value}</div>
      {footnote ? <div className="mt-0.5 text-2xs leading-snug text-ink-faint">{footnote}</div> : null}
    </div>
  );
}

export function MetricGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 ${className}`}>{children}</div>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

/**
 * An accessible info tooltip.
 *
 * It is a real <button> so it is reachable by keyboard and announced by screen
 * readers, and the panel is linked by aria-describedby rather than existing only
 * as a visual hover effect. Hover-only tooltips are invisible to keyboard and
 * touch users.
 */
export function InfoTip({ children, label }: { children: ReactNode; label: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="grid h-4 w-4 place-items-center rounded-full border border-line-strong text-[9px] font-bold leading-none text-ink-faint transition-colors hover:border-accent hover:text-accent"
      >
        i
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-40 mb-2 w-60 -translate-x-1/2 rounded-card border border-line-strong bg-surface-raised px-3 py-2 text-xs font-normal leading-relaxed text-ink-muted shadow-xl"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

export function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  hint,
  disabled,
  symbol,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  hint?: string;
  disabled?: boolean;
  symbol?: ReactNode;
}) {
  const id = useId();
  const display = format ? format(value) : String(value);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
          <span>{label}</span>
          {symbol ? <span className="text-ink-faint">{symbol}</span> : null}
          {hint ? <InfoTip label={`About ${label}`}>{hint}</InfoTip> : null}
        </label>
        <span className="tabular text-xs font-semibold text-ink">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        // Screen readers announce the formatted value rather than the raw number,
        // so "0.2" is read as "20%".
        aria-valuetext={display}
        className="mt-1"
      />
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
  error,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  error?: string;
  suffix?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <span>{label}</span>
        {hint ? <InfoTip label={`About ${label}`}>{hint}</InfoTip> : null}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={id}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            // Reject NaN rather than letting it poison every downstream
            // calculation, where it would silently turn whole charts blank.
            if (Number.isFinite(parsed)) onChange(parsed);
          }}
          className={`tabular w-full rounded-md border bg-surface-sunken px-2.5 py-1.5 text-sm text-ink transition-colors focus:border-accent ${
            error ? "border-negative" : "border-line"
          }`}
        />
        {suffix ? <span className="shrink-0 text-xs text-ink-faint">{suffix}</span> : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-2xs text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <span>{label}</span>
        {hint ? <InfoTip label={`About ${label}`}>{hint}</InfoTip> : null}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="mt-1 w-full rounded-md border border-line bg-surface-sunken px-2.5 py-1.5 text-sm text-ink transition-colors focus:border-accent"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <span>{label}</span>
        {hint ? <InfoTip label={`About ${label}`}>{hint}</InfoTip> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
          checked ? "border-accent bg-accent" : "border-line-strong bg-surface-sunken"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-transform ${
            checked ? "translate-x-[18px] bg-accent-ink" : "translate-x-0.5 bg-ink-faint"
          }`}
        />
      </button>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "md",
  disabled,
  type = "button",
  ariaLabel,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  disabled?: boolean;
  type?: "button" | "submit";
  ariaLabel?: string;
  className?: string;
}) {
  const variants = {
    primary: "bg-accent text-accent-ink hover:brightness-110 border-accent",
    secondary: "bg-surface-raised text-ink border-line hover:border-line-strong",
    ghost: "bg-transparent text-ink-muted border-transparent hover:text-ink hover:bg-surface-raised",
  };
  const sizes = { sm: "px-2.5 py-1 text-xs", md: "px-3.5 py-1.5 text-sm" };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-all disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "positive" | "negative" | "caution";
}) {
  const tones = {
    neutral: "border-line text-ink-muted bg-surface-raised",
    accent: "border-accent-muted text-accent bg-accent-muted/20",
    positive: "border-positive/40 text-positive bg-positive/10",
    negative: "border-negative/40 text-negative bg-negative/10",
    caution: "border-caution/40 text-caution bg-caution/10",
  };
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-2xs font-medium leading-none ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

/**
 * Tabs following the WAI-ARIA tab pattern, including arrow-key navigation —
 * which is what the pattern actually requires, and what makes a tab list usable
 * without a mouse.
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: { value: T; label: string }[];
  active: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((tab, index) => {
        const selected = tab.value === active;
        return (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const delta = e.key === "ArrowRight" ? 1 : -1;
              // Wrap around at both ends.
              const next = (index + delta + tabs.length) % tabs.length;
              onChange(tabs[next].value);
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              selected
                ? "border-accent text-ink"
                : "border-transparent text-ink-faint hover:text-ink-muted"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Table                                                               */
/* ------------------------------------------------------------------ */

export function DataTable({
  columns,
  rows,
  caption,
  align = [],
}: {
  columns: string[];
  rows: ReactNode[][];
  caption?: string;
  align?: ("left" | "right")[];
}) {
  if (rows.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-xs text-ink-faint">No rows to display yet.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        {caption ? <caption className="mb-2 text-left text-2xs text-ink-faint">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-line">
            {columns.map((column, i) => (
              <th
                key={column}
                scope="col"
                className={`whitespace-nowrap px-2.5 py-2 font-medium uppercase tracking-wider text-ink-faint text-2xs ${
                  align[i] === "right" ? "text-right" : "text-left"
                }`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-line/60 last:border-0">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`whitespace-nowrap px-2.5 py-1.5 text-ink-muted ${
                    align[cellIndex] === "right" ? "tabular text-right" : "text-left"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function LoadingState({ message = "Running simulation" }: { message?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 py-12">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
            style={{ animationDelay: `${i * 140}ms`, animationDuration: "1s" }}
          />
        ))}
      </div>
      <p className="text-xs text-ink-muted">{message}…</p>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink-muted">{title}</p>
      <p className="max-w-sm text-xs leading-relaxed text-ink-faint">{description}</p>
    </div>
  );
}

export function ErrorState({ title, description, onRetry }: { title: string; description: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 rounded-card border border-negative/40 bg-negative/5 px-6 py-8 text-center"
    >
      <p className="text-sm font-medium text-negative">{title}</p>
      <p className="max-w-md text-xs leading-relaxed text-ink-muted">{description}</p>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Callout({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "caution" | "accent";
  title?: string;
}) {
  const tones = {
    neutral: "border-line bg-surface-raised",
    caution: "border-caution/40 bg-caution/5",
    accent: "border-accent-muted bg-accent-muted/10",
  };
  return (
    <div className={`rounded-card border px-4 py-3 ${tones[tone]}`}>
      {title ? <p className="mb-1 text-xs font-semibold text-ink">{title}</p> : null}
      <div className="text-xs leading-relaxed text-ink-muted [&>p+p]:mt-2">{children}</div>
    </div>
  );
}
