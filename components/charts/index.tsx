"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart,
  ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { useMemo, type ReactNode } from "react";
import { downsampleAligned, downsampleSeries } from "@/lib/charts/downsample";

export const SERIES_COLORS = [
  "var(--series-1)", "var(--series-2)", "var(--series-3)",
  "var(--series-4)", "var(--series-5)", "var(--series-6)",
];

const AXIS_PROPS = {
  stroke: "var(--ink-faint)",
  tick: { fill: "var(--ink-faint)", fontSize: 10 },
  tickLine: false,
} as const;

/**
 * A consistent frame for every chart.
 *
 * `description` is not decoration — it is the chart's text alternative. A canvas
 * or SVG chart conveys nothing to a screen reader, so each one carries a
 * role="img" wrapper with a written summary of what the picture shows. That is
 * also why every chart below pairs with a numeric readout somewhere on the page:
 * no information in QuantLab exists only as a shape.
 */
export function ChartFrame({
  title,
  description,
  height = 280,
  children,
  legend,
  footnote,
}: {
  title: string;
  description: string;
  height?: number;
  children: ReactNode;
  legend?: ReactNode;
  footnote?: string;
}) {
  return (
    <figure className="w-full">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <figcaption className="text-xs font-medium text-ink">{title}</figcaption>
        {legend}
      </div>
      <div role="img" aria-label={`${title}. ${description}`} style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children as never}
        </ResponsiveContainer>
      </div>
      {footnote ? <p className="mt-1.5 text-2xs leading-relaxed text-ink-faint">{footnote}</p> : null}
    </figure>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-2xs text-ink-muted">
          <span
            aria-hidden="true"
            className="h-0 w-3.5 shrink-0 border-t-2"
            style={{ borderColor: item.color, borderTopStyle: item.dashed ? "dashed" : "solid" }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function TooltipShell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-line-strong bg-surface-raised px-2.5 py-1.5 text-2xs shadow-xl">
      {children}
    </div>
  );
}

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

function makeTooltip(
  formatValue: (v: number) => string,
  labelPrefix: string,
  nameMap?: Record<string, string>,
) {
  return function CustomTooltip({
    active, payload, label,
  }: { active?: boolean; payload?: TooltipEntry[]; label?: number | string }) {
    if (!active || !payload || payload.length === 0) return null;
    return (
      <TooltipShell>
        <p className="mb-1 font-medium text-ink">
          {labelPrefix}
          {typeof label === "number" ? label.toLocaleString() : label}
        </p>
        <ul className="space-y-0.5">
          {payload.map((entry, i) => {
            if (entry.value === null || entry.value === undefined) return null;
            const key = String(entry.dataKey ?? entry.name ?? i);
            const name = nameMap?.[key] ?? String(entry.name ?? key);
            return (
              <li key={i} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-sm"
                  style={{ background: entry.color }}
                />
                <span className="text-ink-muted">{name}</span>
                <span className="tabular ml-auto pl-2 font-medium text-ink">
                  {typeof entry.value === "number" ? formatValue(entry.value) : entry.value}
                </span>
              </li>
            );
          })}
        </ul>
      </TooltipShell>
    );
  };
}

/* ------------------------------------------------------------------ */
/* Multi-series line chart                                             */
/* ------------------------------------------------------------------ */

export interface LineSeries {
  key: string;
  label: string;
  values: (number | null)[];
  color?: string;
  dashed?: boolean;
  width?: number;
}

export function MultiLineChart({
  series,
  xLabel,
  yLabel,
  formatY = (v) => v.toFixed(2),
  formatX,
  maxPoints = 600,
  referenceY,
  referenceYLabel,
  height = 300,
  title,
  description,
  footnote,
  showLegend = true,
}: {
  series: LineSeries[];
  xLabel: string;
  yLabel: string;
  formatY?: (v: number) => string;
  formatX?: (v: number) => string;
  maxPoints?: number;
  referenceY?: number;
  referenceYLabel?: string;
  height?: number;
  title: string;
  description: string;
  footnote?: string;
  showLegend?: boolean;
}) {
  const data = useMemo(
    () => downsampleAligned(series.map((s) => ({ key: s.key, values: s.values })), maxPoints),
    [series, maxPoints],
  );
  const nameMap = useMemo(
    () => Object.fromEntries(series.map((s) => [s.key, s.label])),
    [series],
  );

  const legend = showLegend ? (
    <ChartLegend
      items={series.map((s, i) => ({
        label: s.label,
        color: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length],
        dashed: s.dashed,
      }))}
    />
  ) : undefined;

  return (
    <ChartFrame title={title} description={description} height={height} legend={legend} footnote={footnote}>
      <LineChart data={data} margin={{ top: 6, right: 10, bottom: 16, left: 4 }}>
        <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="index"
          type="number"
          domain={["dataMin", "dataMax"]}
          {...AXIS_PROPS}
          tickFormatter={formatX ?? ((v: number) => String(v))}
          label={{ value: xLabel, position: "insideBottom", offset: -8, fill: "var(--ink-faint)", fontSize: 10 }}
        />
        <YAxis
          {...AXIS_PROPS}
          width={56}
          tickFormatter={formatY}
          label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--ink-faint)", fontSize: 10, offset: 8 }}
        />
        <Tooltip content={makeTooltip(formatY, `${xLabel} `, nameMap) as never} />
        {referenceY !== undefined ? (
          <ReferenceLine
            y={referenceY}
            stroke="var(--ink-faint)"
            strokeDasharray="4 4"
            label={{ value: referenceYLabel, fill: "var(--ink-faint)", fontSize: 9, position: "right" }}
          />
        ) : null}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={s.width ?? 1.6}
            strokeDasharray={s.dashed ? "4 3" : undefined}
            dot={false}
            // `connectNulls={false}` keeps a gap where data is genuinely
            // missing — e.g. before a rolling window has filled — rather than
            // drawing a straight line through a period we know nothing about.
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Path bundle: many simulated paths plus percentile bands             */
/* ------------------------------------------------------------------ */

export function PathBundleChart({
  paths,
  percentiles,
  title,
  description,
  yLabel,
  xLabel,
  formatY = (v) => v.toFixed(0),
  initialValue,
  height = 320,
  footnote,
  maxPoints = 300,
}: {
  paths: number[][];
  percentiles?: { p5: number[]; p25: number[]; median: number[]; p75: number[]; p95: number[] };
  title: string;
  description: string;
  yLabel: string;
  xLabel: string;
  formatY?: (v: number) => string;
  initialValue?: number;
  height?: number;
  footnote?: string;
  maxPoints?: number;
}) {
  const data = useMemo(() => {
    const seriesSpec: { key: string; values: (number | null)[] }[] = paths.map((p, i) => ({
      key: `p${i}`,
      values: p,
    }));
    if (percentiles) {
      seriesSpec.push(
        { key: "band5", values: percentiles.p5 },
        { key: "band25", values: percentiles.p25 },
        { key: "median", values: percentiles.median },
        { key: "band75", values: percentiles.p75 },
        { key: "band95", values: percentiles.p95 },
      );
    }
    const rows = downsampleAligned(seriesSpec, maxPoints);
    // Recharts stacks areas from a base value, so the bands are expressed as
    // (lower bound, height) pairs rather than absolute upper bounds.
    if (percentiles) {
      for (const row of rows) {
        const b5 = row.band5 as number | null;
        const b95 = row.band95 as number | null;
        const b25 = row.band25 as number | null;
        const b75 = row.band75 as number | null;
        row.outerBase = b5;
        row.outerSpan = b5 !== null && b95 !== null ? b95 - b5 : null;
        row.innerBase = b25;
        row.innerSpan = b25 !== null && b75 !== null ? b75 - b25 : null;
      }
    }
    return rows;
  }, [paths, percentiles, maxPoints]);

  const legendItems = [{ label: "Simulated paths", color: "var(--series-1)" }];
  if (percentiles) {
    legendItems.push(
      { label: "Median", color: "var(--ink)" },
      { label: "25–75th pct", color: "var(--accent)" },
      { label: "5–95th pct", color: "var(--accent-muted)" },
    );
  }

  return (
    <ChartFrame
      title={title}
      description={description}
      height={height}
      legend={<ChartLegend items={legendItems} />}
      footnote={footnote}
    >
      <ComposedChart data={data} margin={{ top: 6, right: 10, bottom: 16, left: 4 }}>
        <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="index"
          type="number"
          domain={["dataMin", "dataMax"]}
          {...AXIS_PROPS}
          label={{ value: xLabel, position: "insideBottom", offset: -8, fill: "var(--ink-faint)", fontSize: 10 }}
        />
        <YAxis
          {...AXIS_PROPS}
          width={56}
          tickFormatter={formatY}
          label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--ink-faint)", fontSize: 10, offset: 8 }}
        />
        {percentiles ? (
          <>
            <Area
              dataKey="outerBase" stackId="outer" stroke="none" fill="transparent" isAnimationActive={false}
              activeDot={false} legendType="none"
            />
            <Area
              dataKey="outerSpan" stackId="outer" stroke="none" fill="var(--accent-muted)" fillOpacity={0.3}
              isAnimationActive={false} activeDot={false} legendType="none"
            />
            <Area
              dataKey="innerBase" stackId="inner" stroke="none" fill="transparent" isAnimationActive={false}
              activeDot={false} legendType="none"
            />
            <Area
              dataKey="innerSpan" stackId="inner" stroke="none" fill="var(--accent)" fillOpacity={0.22}
              isAnimationActive={false} activeDot={false} legendType="none"
            />
          </>
        ) : null}
        {paths.map((_, i) => (
          <Line
            key={i}
            type="monotone"
            dataKey={`p${i}`}
            stroke="var(--series-1)"
            // Opacity falls as the bundle grows so the density of lines itself
            // reads as a probability distribution rather than a solid block.
            strokeOpacity={Math.max(0.1, Math.min(0.7, 14 / Math.max(1, paths.length)))}
            strokeWidth={paths.length > 40 ? 0.7 : 1.1}
            dot={false}
            isAnimationActive={false}
            legendType="none"
          />
        ))}
        {percentiles ? (
          <Line
            type="monotone" dataKey="median" stroke="var(--ink)" strokeWidth={1.8} dot={false}
            isAnimationActive={false} legendType="none"
          />
        ) : null}
        {initialValue !== undefined ? (
          <ReferenceLine y={initialValue} stroke="var(--ink-faint)" strokeDasharray="4 4" />
        ) : null}
      </ComposedChart>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Histogram                                                           */
/* ------------------------------------------------------------------ */

export function HistogramChart({
  bins,
  title,
  description,
  xLabel,
  yLabel = "Density",
  formatX = (v) => v.toFixed(0),
  markers = [],
  overlay,
  height = 260,
  footnote,
  useDensity = true,
}: {
  bins: { center: number; count: number; density: number; binStart: number; binEnd: number }[];
  title: string;
  description: string;
  xLabel: string;
  yLabel?: string;
  formatX?: (v: number) => string;
  markers?: { value: number; label: string; color?: string }[];
  overlay?: { x: number; y: number }[];
  height?: number;
  footnote?: string;
  useDensity?: boolean;
}) {
  const data = useMemo(
    () =>
      bins.map((b) => ({
        center: b.center,
        value: useDensity ? b.density : b.count,
        count: b.count,
        overlay: overlay ? interpolate(overlay, b.center) : undefined,
      })),
    [bins, useDensity, overlay],
  );

  return (
    <ChartFrame
      title={title}
      description={description}
      height={height}
      footnote={footnote}
      legend={
        markers.length > 0 ? (
          <ChartLegend items={markers.map((m) => ({ label: m.label, color: m.color ?? "var(--ink-faint)", dashed: true }))} />
        ) : undefined
      }
    >
      <ComposedChart data={data} margin={{ top: 6, right: 10, bottom: 16, left: 4 }}>
        <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="center" type="number" domain={["dataMin", "dataMax"]} {...AXIS_PROPS}
          tickFormatter={formatX}
          label={{ value: xLabel, position: "insideBottom", offset: -8, fill: "var(--ink-faint)", fontSize: 10 }}
        />
        <YAxis
          {...AXIS_PROPS} width={56}
          tickFormatter={(v: number) => (useDensity ? v.toPrecision(2) : String(v))}
          label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--ink-faint)", fontSize: 10, offset: 8 }}
        />
        <Tooltip
          content={
            (({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) => {
              if (!active || !payload || payload.length === 0) return null;
              const row = (payload[0] as unknown as { payload: { center: number; count: number } }).payload;
              return (
                <TooltipShell>
                  <p className="font-medium text-ink">{formatX(row.center)}</p>
                  <p className="tabular text-ink-muted">{row.count.toLocaleString()} observations</p>
                </TooltipShell>
              );
            }) as never
          }
        />
        <Bar dataKey="value" fill="var(--series-1)" fillOpacity={0.55} isAnimationActive={false} />
        {overlay ? (
          <Line
            type="monotone" dataKey="overlay" stroke="var(--series-2)" strokeWidth={1.8} dot={false}
            isAnimationActive={false}
          />
        ) : null}
        {markers.map((m) => (
          <ReferenceLine
            key={m.label}
            x={m.value}
            stroke={m.color ?? "var(--ink-faint)"}
            strokeDasharray="4 3"
            strokeWidth={1.4}
          />
        ))}
      </ComposedChart>
    </ChartFrame>
  );
}

/** Linear interpolation of an overlay curve at an arbitrary x. */
function interpolate(curve: { x: number; y: number }[], x: number): number | undefined {
  if (curve.length === 0) return undefined;
  if (x <= curve[0].x || x >= curve[curve.length - 1].x) return undefined;
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].x >= x) {
      const a = curve[i - 1];
      const b = curve[i];
      const t = (x - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Scatter                                                             */
/* ------------------------------------------------------------------ */

export function ScatterPlot({
  points,
  highlights = [],
  frontier,
  title,
  description,
  xLabel,
  yLabel,
  formatX = (v) => `${(v * 100).toFixed(1)}%`,
  formatY = (v) => `${(v * 100).toFixed(1)}%`,
  colorBy,
  height = 340,
  footnote,
}: {
  points: { x: number; y: number; z?: number }[];
  highlights?: { x: number; y: number; label: string; color: string }[];
  frontier?: { x: number; y: number }[];
  title: string;
  description: string;
  xLabel: string;
  yLabel: string;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  colorBy?: { min: number; max: number };
  height?: number;
  footnote?: string;
}) {
  // Colour by a third variable (Sharpe ratio) using a perceptually ordered ramp
  // from muted to accent. Lightness increases with the value, so the ordering
  // survives greyscale printing and colour-vision deficiency.
  const colorFor = (z: number | undefined) => {
    if (z === undefined || !colorBy) return "var(--series-1)";
    const t = Math.max(0, Math.min(1, (z - colorBy.min) / Math.max(1e-9, colorBy.max - colorBy.min)));
    return `color-mix(in oklab, var(--accent) ${Math.round(t * 100)}%, var(--surface-sunken))`;
  };

  return (
    <ChartFrame
      title={title}
      description={description}
      height={height}
      footnote={footnote}
      legend={
        highlights.length > 0 ? (
          <ChartLegend items={highlights.map((h) => ({ label: h.label, color: h.color }))} />
        ) : undefined
      }
    >
      <ScatterChart margin={{ top: 8, right: 14, bottom: 16, left: 4 }}>
        <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" />
        <XAxis
          dataKey="x" type="number" {...AXIS_PROPS} tickFormatter={formatX} domain={["auto", "auto"]}
          label={{ value: xLabel, position: "insideBottom", offset: -8, fill: "var(--ink-faint)", fontSize: 10 }}
        />
        <YAxis
          dataKey="y" type="number" {...AXIS_PROPS} width={56} tickFormatter={formatY} domain={["auto", "auto"]}
          label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--ink-faint)", fontSize: 10, offset: 8 }}
        />
        <Tooltip
          content={
            (({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) => {
              if (!active || !payload || payload.length === 0) return null;
              const row = (payload[0] as unknown as { payload: { x: number; y: number; z?: number; label?: string } })
                .payload;
              return (
                <TooltipShell>
                  {row.label ? <p className="mb-0.5 font-medium text-ink">{row.label}</p> : null}
                  <p className="tabular text-ink-muted">
                    {xLabel}: <span className="text-ink">{formatX(row.x)}</span>
                  </p>
                  <p className="tabular text-ink-muted">
                    {yLabel}: <span className="text-ink">{formatY(row.y)}</span>
                  </p>
                  {row.z !== undefined ? (
                    <p className="tabular text-ink-muted">
                      Sharpe: <span className="text-ink">{row.z.toFixed(2)}</span>
                    </p>
                  ) : null}
                </TooltipShell>
              );
            }) as never
          }
        />
        <Scatter data={points} isAnimationActive={false} shape="circle" fillOpacity={0.5}>
          {points.map((p, i) => (
            <Cell key={i} fill={colorFor(p.z)} />
          ))}
        </Scatter>
        {frontier ? (
          <Scatter data={frontier} line={{ stroke: "var(--ink)", strokeWidth: 1.8 }} shape={() => <g />} isAnimationActive={false} />
        ) : null}
        {highlights.map((h) => (
          <Scatter
            key={h.label}
            data={[{ x: h.x, y: h.y, label: h.label }]}
            fill={h.color}
            shape="star"
            isAnimationActive={false}
          />
        ))}
      </ScatterChart>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Drawdown / area chart                                               */
/* ------------------------------------------------------------------ */

export function DrawdownChart({
  series,
  title,
  description,
  peakIndex,
  troughIndex,
  height = 180,
  footnote,
}: {
  series: number[];
  title: string;
  description: string;
  peakIndex?: number;
  troughIndex?: number;
  height?: number;
  footnote?: string;
}) {
  const data = useMemo(() => downsampleSeries(series, 500), [series]);

  return (
    <ChartFrame title={title} description={description} height={height} footnote={footnote}>
      <AreaChart data={data} margin={{ top: 6, right: 10, bottom: 6, left: 4 }}>
        <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="index" type="number" domain={["dataMin", "dataMax"]} {...AXIS_PROPS} />
        <YAxis
          {...AXIS_PROPS} width={56} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
        />
        <Tooltip content={makeTooltip((v) => `${(v * 100).toFixed(2)}%`, "Step ", { value: "Drawdown" }) as never} />
        <Area
          type="monotone" dataKey="value" stroke="var(--negative)" strokeWidth={1.2}
          fill="var(--negative)" fillOpacity={0.18} isAnimationActive={false}
        />
        {troughIndex !== undefined ? (
          <ReferenceLine x={troughIndex} stroke="var(--negative)" strokeDasharray="3 3" />
        ) : null}
        {peakIndex !== undefined ? (
          <ReferenceLine x={peakIndex} stroke="var(--positive)" strokeDasharray="3 3" />
        ) : null}
      </AreaChart>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Equity curve with drawdown shading                                  */
/* ------------------------------------------------------------------ */

export function EquityChart({
  series,
  title,
  description,
  peakIndex,
  troughIndex,
  peakValue,
  troughValue,
  height = 280,
  formatY = (v) => v.toFixed(2),
  yLabel = "Portfolio value",
  footnote,
  regimes,
}: {
  series: LineSeries[];
  title: string;
  description: string;
  peakIndex?: number;
  troughIndex?: number;
  peakValue?: number;
  troughValue?: number;
  height?: number;
  formatY?: (v: number) => string;
  yLabel?: string;
  footnote?: string;
  regimes?: { start: number; end: number; color: string; name: string }[];
}) {
  const data = useMemo(
    () => downsampleAligned(series.map((s) => ({ key: s.key, values: s.values })), 700),
    [series],
  );
  const nameMap = useMemo(() => Object.fromEntries(series.map((s) => [s.key, s.label])), [series]);

  return (
    <ChartFrame
      title={title}
      description={description}
      height={height}
      footnote={footnote}
      legend={
        <ChartLegend
          items={series.map((s, i) => ({
            label: s.label,
            color: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length],
            dashed: s.dashed,
          }))}
        />
      }
    >
      <ComposedChart data={data} margin={{ top: 6, right: 10, bottom: 16, left: 4 }}>
        <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" vertical={false} />
        {/* Regime shading is drawn first so it sits behind the data. */}
        {regimes?.map((r, i) => (
          <ReferenceArea
            key={i} x1={r.start} x2={r.end} fill={r.color} fillOpacity={0.12} stroke="none"
            ifOverflow="extendDomain"
          />
        ))}
        <XAxis
          dataKey="index" type="number" domain={["dataMin", "dataMax"]} {...AXIS_PROPS}
          label={{ value: "Trading day", position: "insideBottom", offset: -8, fill: "var(--ink-faint)", fontSize: 10 }}
        />
        <YAxis
          {...AXIS_PROPS} width={60} tickFormatter={formatY}
          label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--ink-faint)", fontSize: 10, offset: 8 }}
        />
        <Tooltip content={makeTooltip(formatY, "Day ", nameMap) as never} />
        {series.map((s, i) => (
          <Line
            key={s.key} type="monotone" dataKey={s.key} name={s.label}
            stroke={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={s.width ?? 1.6} strokeDasharray={s.dashed ? "4 3" : undefined}
            dot={false} connectNulls={false} isAnimationActive={false}
          />
        ))}
        {peakIndex !== undefined && peakValue !== undefined ? (
          <ReferenceDot
            x={peakIndex} y={peakValue} r={4} fill="var(--positive)" stroke="var(--canvas)" strokeWidth={1.5}
            label={{ value: "Peak", fill: "var(--positive)", fontSize: 9, position: "top" }}
          />
        ) : null}
        {troughIndex !== undefined && troughValue !== undefined ? (
          <ReferenceDot
            x={troughIndex} y={troughValue} r={4} fill="var(--negative)" stroke="var(--canvas)" strokeWidth={1.5}
            label={{ value: "Trough", fill: "var(--negative)", fontSize: 9, position: "bottom" }}
          />
        ) : null}
      </ComposedChart>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Bar chart                                                           */
/* ------------------------------------------------------------------ */

export function SimpleBarChart({
  data,
  title,
  description,
  xKey,
  bars,
  formatY = (v) => v.toFixed(2),
  height = 240,
  footnote,
  horizontal = false,
}: {
  data: Record<string, string | number>[];
  title: string;
  description: string;
  xKey: string;
  bars: { key: string; label: string; color: string }[];
  formatY?: (v: number) => string;
  height?: number;
  footnote?: string;
  horizontal?: boolean;
}) {
  return (
    <ChartFrame
      title={title}
      description={description}
      height={height}
      footnote={footnote}
      legend={bars.length > 1 ? <ChartLegend items={bars} /> : undefined}
    >
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 6, right: 12, bottom: 6, left: horizontal ? 10 : 4 }}
      >
        <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...AXIS_PROPS} tickFormatter={formatY} />
            <YAxis type="category" dataKey={xKey} {...AXIS_PROPS} width={104} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} {...AXIS_PROPS} interval={0} angle={-18} textAnchor="end" height={46} />
            <YAxis {...AXIS_PROPS} width={56} tickFormatter={formatY} />
          </>
        )}
        <Tooltip content={makeTooltip(formatY, "", Object.fromEntries(bars.map((b) => [b.key, b.label]))) as never} />
        {bars.map((b) => (
          <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} isAnimationActive={false} radius={[2, 2, 0, 0]} />
        ))}
      </BarChart>
    </ChartFrame>
  );
}

export { Legend };
