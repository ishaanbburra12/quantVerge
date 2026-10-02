"use client";

import { useMemo, useState, useEffect } from "react";
import { generateGBM } from "@/lib/simulation/generators";
import { normalPDF } from "@/lib/math/distributions";
import { covarianceFromCorrelation } from "@/lib/math/linearAlgebra";
import { generateRandomPortfolios, efficientFrontier } from "@/lib/finance/portfolio";
import { rollingVolatility } from "@/lib/statistics/descriptive";
import { logReturns } from "@/lib/finance/performance";
import { downsampleSeries } from "@/lib/charts/downsample";

/**
 * The hero visualisations.
 *
 * Every one of these is computed from the real library code — the same functions
 * the labs use — rather than being a decorative SVG. The point of the homepage is
 * to show that the site actually calculates things, so faking the pictures would
 * undercut the only claim it makes.
 *
 * They render as hand-built SVG rather than through Recharts, because at this
 * size axes and tooltips would be noise, and because four small inline SVGs cost
 * far less than four chart-library instances on the first page a visitor loads.
 */

type Panel = "paths" | "distribution" | "frontier" | "volatility";

const PANELS: { id: Panel; label: string; caption: string }[] = [
  { id: "paths", label: "Price paths", caption: "40 geometric Brownian motion paths, one year, σ = 20%" },
  { id: "distribution", label: "Distribution", caption: "Ending-price distribution against the analytic log-normal density" },
  { id: "frontier", label: "Efficient frontier", caption: "4,000 random portfolios and the frontier that bounds them" },
  { id: "volatility", label: "Rolling volatility", caption: "60-day realised volatility through a turbulent middle period" },
];

export function HeroVisualisation() {
  const [panel, setPanel] = useState<Panel>("paths");
  // Cycle through the panels, but stop as soon as the visitor chooses one: an
  // animation that fights the user's click is worse than no animation.
  const [autoCycle, setAutoCycle] = useState(true);

  /**
   * Render the charts only after mounting on the client.
   *
   * These panels are computed from floating-point simulations, and Node and the
   * browser do not always agree on the final bit of `Math.exp`. That produced a
   * real hydration mismatch — the server rendered y="115.99999999999997" where
   * the client computed 116.00000000000001 — which React cannot patch up and
   * which would recur on any change to the maths.
   *
   * Deferring to the client also keeps several thousand simulated paths off the
   * server's render path entirely. The reserved height prevents layout shift,
   * and the chart's meaning is carried by the caption below it, which is
   * server-rendered and always present.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!autoCycle) return;
    // Honour the reduced-motion preference by not cycling at all.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setPanel((current) => {
        const index = PANELS.findIndex((p) => p.id === current);
        return PANELS[(index + 1) % PANELS.length].id;
      });
    }, 5200);
    return () => window.clearInterval(timer);
  }, [autoCycle]);

  const active = PANELS.find((p) => p.id === panel)!;

  return (
    <div className="rounded-card border border-line bg-surface">
      <div className="flex flex-wrap gap-1 border-b border-line px-2 py-1.5" role="tablist" aria-label="Visualisation">
        {PANELS.map((p) => (
          <button
            key={p.id}
            role="tab"
            type="button"
            aria-selected={p.id === panel}
            onClick={() => {
              setPanel(p.id);
              setAutoCycle(false);
            }}
            className={`rounded px-2.5 py-1 text-2xs font-medium transition-colors ${
              p.id === panel ? "bg-surface-raised text-ink" : "text-ink-faint hover:text-ink-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="px-3 pb-2 pt-3 sm:px-4">
        <div className="animate-fade-in" key={panel}>
          {!mounted ? (
            <div
              className="grid w-full place-items-center"
              style={{ aspectRatio: `${W} / ${H}` }}
              aria-hidden="true"
            >
              <span className="text-2xs text-ink-faint">Computing…</span>
            </div>
          ) : (
            <>
              {panel === "paths" ? <PathsPanel /> : null}
              {panel === "distribution" ? <DistributionPanel /> : null}
              {panel === "frontier" ? <FrontierPanel /> : null}
              {panel === "volatility" ? <VolatilityPanel /> : null}
            </>
          )}
        </div>
        <p className="mt-1.5 text-2xs leading-relaxed text-ink-faint">{active.caption}</p>
      </div>
    </div>
  );
}

const W = 640;
const H = 240;
const PAD = { top: 10, right: 10, bottom: 18, left: 34 };

function scaleFactory(domainMin: number, domainMax: number, rangeMin: number, rangeMax: number) {
  const span = domainMax - domainMin || 1;
  return (value: number) => rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
}

function Axes({
  yTicks,
  formatY,
  xLabel,
}: {
  yTicks: { value: number; y: number }[];
  formatY: (v: number) => string;
  xLabel?: string;
}) {
  return (
    <g aria-hidden="true">
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W - PAD.right} y1={tick.y} y2={tick.y} stroke="var(--grid)" strokeDasharray="2 4" />
          <text x={PAD.left - 6} y={tick.y + 3} textAnchor="end" fontSize="9" fill="var(--ink-faint)" className="tabular">
            {formatY(tick.value)}
          </text>
        </g>
      ))}
      {xLabel ? (
        <text x={(W + PAD.left) / 2} y={H - 3} textAnchor="middle" fontSize="9" fill="var(--ink-faint)">
          {xLabel}
        </text>
      ) : null}
    </g>
  );
}

function PathsPanel() {
  const { paths, yMin, yMax } = useMemo(() => {
    const generated: number[][] = [];
    for (let i = 0; i < 40; i++) {
      generated.push(
        generateGBM({
          initialPrice: 100,
          drift: 0.07,
          volatility: 0.2,
          steps: 252,
          horizonYears: 1,
          // A fixed base seed keeps the homepage identical on every visit, which
          // also means the server and client render the same picture.
          seed: 20260101 + i * 7919,
        }),
      );
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const path of generated) {
      for (const v of path) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    return { paths: generated, yMin: lo * 0.98, yMax: hi * 1.02 };
  }, []);

  const x = scaleFactory(0, 252, PAD.left, W - PAD.right);
  const y = scaleFactory(yMin, yMax, H - PAD.bottom, PAD.top);
  const ticks = [yMin, (yMin + yMax) / 2, yMax].map((v) => ({ value: Math.round(v), y: y(v) }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Forty simulated price paths all starting at 100, fanning out over one year into a wide range of ending values."
    >
      <Axes yTicks={ticks} formatY={(v) => `$${v}`} xLabel="Trading day" />
      <line x1={PAD.left} x2={W - PAD.right} y1={y(100)} y2={y(100)} stroke="var(--ink-faint)" strokeDasharray="4 4" strokeWidth="0.8" />
      {paths.map((path, i) => {
        const reduced = downsampleSeries(path, 120);
        const d = reduced.map((p, j) => `${j === 0 ? "M" : "L"}${x(p.index).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
        return <path key={i} d={d} fill="none" stroke="var(--series-1)" strokeOpacity={0.34} strokeWidth="0.9" />;
      })}
    </svg>
  );
}

function DistributionPanel() {
  const { bins, curve, maxDensity, xMin, xMax } = useMemo(() => {
    // 6,000 terminal prices, computed properly rather than sketched.
    const endings: number[] = [];
    for (let i = 0; i < 6000; i++) {
      const path = generateGBM({
        initialPrice: 100, drift: 0.07, volatility: 0.2, steps: 60, horizonYears: 1,
        seed: (777000 + i * 2654435761) >>> 0,
      });
      endings.push(path[path.length - 1]);
    }
    const lo = 40;
    const hi = 220;
    const binCount = 46;
    const width = (hi - lo) / binCount;
    const counts = new Array(binCount).fill(0);
    for (const v of endings) {
      const idx = Math.floor((v - lo) / width);
      if (idx >= 0 && idx < binCount) counts[idx] += 1;
    }
    const densities = counts.map((c) => c / (endings.length * width));

    // The analytic log-normal density for comparison: ln(S_T) is normal with
    // mean ln(S0) + (mu - sigma^2/2)T and standard deviation sigma*sqrt(T).
    const mu = Math.log(100) + (0.07 - 0.02) * 1;
    const sd = 0.2;
    const analytic: { x: number; y: number }[] = [];
    for (let s = lo + 1; s <= hi; s += 2) {
      // Change of variables: the density of S is the density of ln(S) divided by S.
      analytic.push({ x: s, y: normalPDF(Math.log(s), mu, sd) / s });
    }

    const peak = Math.max(...densities, ...analytic.map((p) => p.y));
    return {
      bins: densities.map((d, i) => ({ start: lo + i * width, width, density: d })),
      curve: analytic,
      maxDensity: peak * 1.08,
      xMin: lo,
      xMax: hi,
    };
  }, []);

  const x = scaleFactory(xMin, xMax, PAD.left, W - PAD.right);
  const y = scaleFactory(0, maxDensity, H - PAD.bottom, PAD.top);
  const ticks = [0, maxDensity / 2, maxDensity].map((v) => ({ value: v, y: y(v) }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Histogram of 6,000 simulated ending prices, visibly right-skewed, overlaid with the analytic log-normal density curve, which tracks it closely."
    >
      <Axes yTicks={ticks} formatY={(v) => v.toFixed(3)} xLabel="Ending price" />
      {bins.map((bin, i) => {
        const x0 = x(bin.start);
        const x1 = x(bin.start + bin.width);
        const top = y(bin.density);
        return (
          <rect
            key={i} x={x0} y={top} width={Math.max(0.5, x1 - x0 - 0.8)} height={Math.max(0, y(0) - top)}
            fill="var(--series-1)" fillOpacity={0.45}
          />
        );
      })}
      <path
        d={curve.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join(" ")}
        fill="none" stroke="var(--series-2)" strokeWidth="1.8"
      />
      <text x={W - PAD.right - 4} y={PAD.top + 10} textAnchor="end" fontSize="9" fill="var(--series-2)">
        analytic log-normal density
      </text>
    </svg>
  );
}

function FrontierPanel() {
  const { points, frontier, xMax, yMin, yMax } = useMemo(() => {
    const expectedReturns = [0.12, 0.085, 0.035, 0.06];
    const vols = [0.22, 0.16, 0.06, 0.25];
    const corr = [
      [1, 0.72, -0.12, 0.25],
      [0.72, 1, -0.05, 0.3],
      [-0.12, -0.05, 1, -0.08],
      [0.25, 0.3, -0.08, 1],
    ];
    const cov = covarianceFromCorrelation(corr, vols);
    const cloud = generateRandomPortfolios(expectedReturns, cov, 4000, 424242, false, 0.02);
    const curve = efficientFrontier(expectedReturns, cov, 90).filter(
      (p) => p.expectedReturn >= 0.03 && p.expectedReturn <= 0.125,
    );
    return {
      points: cloud,
      frontier: curve,
      xMax: Math.max(...cloud.map((p) => p.volatility)) * 1.06,
      yMin: 0.025,
      yMax: 0.13,
    };
  }, []);

  const x = scaleFactory(0.03, xMax, PAD.left, W - PAD.right);
  const y = scaleFactory(yMin, yMax, H - PAD.bottom, PAD.top);
  const ticks = [0.04, 0.08, 0.12].map((v) => ({ value: v, y: y(v) }));

  const maxSharpe = points.reduce((best, p) => (p.sharpeRatio > best.sharpeRatio ? p : best), points[0]);
  const minVol = points.reduce((best, p) => (p.volatility < best.volatility ? p : best), points[0]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Scatter plot of 4,000 random portfolios forming a bullet shape, with the efficient frontier drawn along its upper-left boundary, and the minimum-variance and maximum-Sharpe portfolios marked."
    >
      <Axes yTicks={ticks} formatY={(v) => `${(v * 100).toFixed(0)}%`} xLabel="Volatility (annualised)" />
      {points.map((p, i) => (
        <circle
          key={i} cx={x(p.volatility)} cy={y(p.expectedReturn)} r="1.5"
          fill="var(--series-1)"
          fillOpacity={0.12 + 0.5 * Math.max(0, Math.min(1, (p.sharpeRatio - 0.2) / 0.5))}
        />
      ))}
      <path
        d={frontier.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.volatility).toFixed(1)} ${y(p.expectedReturn).toFixed(1)}`).join(" ")}
        fill="none" stroke="var(--ink)" strokeWidth="1.6"
      />
      <circle cx={x(minVol.volatility)} cy={y(minVol.expectedReturn)} r="3.5" fill="var(--series-3)" stroke="var(--canvas)" strokeWidth="1.2" />
      <circle cx={x(maxSharpe.volatility)} cy={y(maxSharpe.expectedReturn)} r="3.5" fill="var(--series-2)" stroke="var(--canvas)" strokeWidth="1.2" />
      <text x={x(minVol.volatility) + 7} y={y(minVol.expectedReturn) + 3} fontSize="9" fill="var(--series-3)">
        min variance
      </text>
      <text x={x(maxSharpe.volatility) + 7} y={y(maxSharpe.expectedReturn) + 3} fontSize="9" fill="var(--series-2)">
        max Sharpe
      </text>
    </svg>
  );
}

function VolatilityPanel() {
  const { vol, prices, volMax, priceMin, priceMax } = useMemo(() => {
    // A deliberately non-stationary market: a calm stretch, a turbulent one,
    // then calm again — which is what makes rolling volatility worth plotting.
    const segments = [
      { steps: 300, drift: 0.12, volatility: 0.11 },
      { steps: 220, drift: -0.2, volatility: 0.38 },
      { steps: 380, drift: 0.1, volatility: 0.14 },
    ];
    const series: number[] = [100];
    segments.forEach((segment, i) => {
      const path = generateGBM({
        initialPrice: series[series.length - 1],
        drift: segment.drift,
        volatility: segment.volatility,
        steps: segment.steps,
        horizonYears: segment.steps / 252,
        seed: 31337 + i * 104729,
      });
      series.push(...path.slice(1));
    });
    const rolling = rollingVolatility(logReturns(series), 60, 252);
    const defined = rolling.filter((v): v is number => v !== null);
    return {
      vol: rolling,
      prices: series,
      volMax: Math.max(...defined) * 1.1,
      priceMin: Math.min(...series) * 0.97,
      priceMax: Math.max(...series) * 1.03,
    };
  }, []);

  const x = scaleFactory(0, vol.length, PAD.left, W - PAD.right);
  const yVol = scaleFactory(0, volMax, H - PAD.bottom, H * 0.45);
  const yPrice = scaleFactory(priceMin, priceMax, H * 0.42, PAD.top);
  const ticks = [0, volMax / 2].map((v) => ({ value: v, y: yVol(v) }));

  const volPath = vol
    .map((v, i) => (v === null ? null : `${x(i).toFixed(1)} ${yVol(v).toFixed(1)}`))
    .filter((v): v is string => v !== null)
    .map((coords, i) => `${i === 0 ? "M" : "L"}${coords}`)
    .join(" ");

  const pricePath = downsampleSeries(prices, 200)
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.index).toFixed(1)} ${yPrice(p.value).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="A price path drawn above its 60-day rolling volatility. Volatility is low during the calm periods and spikes sharply through the turbulent middle section."
    >
      <Axes yTicks={ticks} formatY={(v) => `${(v * 100).toFixed(0)}%`} xLabel="Trading day" />
      <path d={pricePath} fill="none" stroke="var(--series-1)" strokeWidth="1.3" />
      <path d={volPath} fill="none" stroke="var(--series-5)" strokeWidth="1.5" />
      <text x={W - PAD.right - 4} y={PAD.top + 10} textAnchor="end" fontSize="9" fill="var(--series-1)">
        price
      </text>
      <text x={W - PAD.right - 4} y={H * 0.52} textAnchor="end" fontSize="9" fill="var(--series-5)">
        60-day realised volatility
      </text>
    </svg>
  );
}
