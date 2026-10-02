"use client";

import { useMemo, useState } from "react";
import {
  Button, Callout, Card, CardBody, CardHeader, MetricCard, MetricGrid,
  SliderControl, NumberField, SelectField, Toggle, DataTable, Badge, ErrorState,
} from "@/components/ui";
import { Equation, EquationBlock, InlineMath } from "@/components/math/Equation";
import { ExperimentSection, FindingBlock, ResearchOnly } from "@/components/labs/ExperimentSection";
import { LabShell, ReproducibilityPanel, SimulationProgress } from "@/components/labs/LabShell";
import { PathBundleChart, HistogramChart, MultiLineChart, SimpleBarChart } from "@/components/charts";
import { useBatchedSimulation, useDebounced } from "@/lib/hooks/useBatchedSimulation";
import { mulberry32, normalSampler } from "@/lib/math/random";
import { histogram, normalPDF } from "@/lib/math/distributions";
import { mean, median, standardDeviation, percentile, skewness, kurtosis } from "@/lib/statistics/descriptive";
import { toCSV } from "@/lib/experiment/config";
import { currency, percent, number as fmtNumber, ratio, integer } from "@/lib/format";
import type { LabMeta } from "@/content/labs";
import {
  MONTE_CARLO_DEFAULTS, MONTE_CARLO_LABELS, type MonteCarloParams,
} from "@/lib/labs/monteCarlo";

const SIMULATION_OPTIONS = [
  { value: "1", label: "1 path" },
  { value: "10", label: "10 paths" },
  { value: "100", label: "100 paths" },
  { value: "1000", label: "1,000 paths" },
  { value: "2000", label: "2,000 paths" },
  { value: "10000", label: "10,000 paths" },
  { value: "50000", label: "50,000 paths" },
];

/** How many full paths we retain for drawing. Everything else is streamed. */
const MAX_STORED_PATHS = 120;

interface Accumulator {
  endingPrices: number[];
  maxDrawdowns: number[];
  /** Full paths, capped, for the bundle chart. */
  storedPaths: number[][];
  /** Running quantile bands, computed from the stored paths only. */
  pathSum: Float64Array;
  pathCount: number;
  aboveStart: number;
}

interface SimulationResult {
  endingPrices: number[];
  maxDrawdowns: number[];
  storedPaths: number[][];
  percentileBands: { p5: number[]; p25: number[]; median: number[]; p75: number[]; p95: number[] } | null;
  probabilityAboveStart: number;
}

/**
 * Simulate one GBM path and fold it into the accumulator.
 *
 * This is written as a single pass that keeps only scalars per path, because
 * storing 50,000 paths of 252 steps would be 12.6 million numbers — about 100 MB
 * as float64, enough to make the tab unresponsive or crash it on a phone. We
 * keep the first `MAX_STORED_PATHS` in full for the chart, and reduce every other
 * path to its ending price and maximum drawdown as it is generated.
 */
function simulateOnePath(accumulator: Accumulator, index: number, params: MonteCarloParams): void {
  const { initialPrice, drift, volatility, steps, horizonYears } = params;
  const dt = horizonYears / steps;
  const driftTerm = (drift - (volatility * volatility) / 2) * dt;
  const diffusionScale = volatility * Math.sqrt(dt);

  // Each path gets its own derived seed, spaced by a large odd constant so that
  // adjacent streams do not share early state.
  const nextNormal = normalSampler(mulberry32((params.seed + index * 2654435761) >>> 0));

  const keepFullPath = index < MAX_STORED_PATHS;
  const path: number[] | null = keepFullPath ? new Array(steps + 1) : null;
  if (path) path[0] = initialPrice;

  let price = initialPrice;
  let peak = price;
  let worstDrawdown = 0;

  for (let t = 1; t <= steps; t++) {
    price = price * Math.exp(driftTerm + diffusionScale * nextNormal());
    if (path) path[t] = price;
    if (price > peak) peak = price;
    const drawdown = (price - peak) / peak;
    if (drawdown < worstDrawdown) worstDrawdown = drawdown;
  }

  accumulator.endingPrices.push(price);
  accumulator.maxDrawdowns.push(Math.abs(worstDrawdown));
  if (path) accumulator.storedPaths.push(path);
  if (price > initialPrice) accumulator.aboveStart += 1;
  accumulator.pathCount += 1;
}

function buildPercentileBands(
  paths: number[][],
  steps: number,
): { p5: number[]; p25: number[]; median: number[]; p75: number[]; p95: number[] } | null {
  // Bands from fewer than ~20 paths would be noise presented as structure.
  if (paths.length < 20) return null;
  const p5: number[] = [];
  const p25: number[] = [];
  const med: number[] = [];
  const p75: number[] = [];
  const p95: number[] = [];
  const column = new Array<number>(paths.length);
  for (let t = 0; t <= steps; t++) {
    for (let i = 0; i < paths.length; i++) column[i] = paths[i][t];
    const sorted = [...column].sort((a, b) => a - b);
    p5.push(percentile(sorted, 5));
    p25.push(percentile(sorted, 25));
    med.push(percentile(sorted, 50));
    p75.push(percentile(sorted, 75));
    p95.push(percentile(sorted, 95));
  }
  return { p5, p25, median: med, p75, p95 };
}

/* ------------------------------------------------------------------ */
/* Lab                                                                 */
/* ------------------------------------------------------------------ */

export function MonteCarloLab({ lab, initialParams }: { lab: LabMeta; initialParams: MonteCarloParams }) {
  const [params, setParams] = useState<MonteCarloParams>(initialParams);
  const [compareVolatility, setCompareVolatility] = useState(0.4);
  const [showBands, setShowBands] = useState(true);

  // Debounce the inputs so dragging a slider does not queue a simulation per pixel.
  const debouncedParams = useDebounced(params, 260);

  const update = <K extends keyof MonteCarloParams>(key: K, value: MonteCarloParams[K]) =>
    setParams((previous) => ({ ...previous, [key]: value }));

  const simulation = useBatchedSimulation<Accumulator, SimulationResult>(
    {
      totalItems: debouncedParams.simulations,
      batchSize: Math.max(10, Math.floor(40000 / Math.max(1, debouncedParams.steps))),
      synchronousThreshold: 1200,
      init: () => ({
        endingPrices: [],
        maxDrawdowns: [],
        storedPaths: [],
        pathSum: new Float64Array(debouncedParams.steps + 1),
        pathCount: 0,
        aboveStart: 0,
      }),
      step: (accumulator, index) => simulateOnePath(accumulator, index, debouncedParams),
      finalize: (accumulator) => ({
        endingPrices: accumulator.endingPrices,
        maxDrawdowns: accumulator.maxDrawdowns,
        storedPaths: accumulator.storedPaths,
        percentileBands: buildPercentileBands(accumulator.storedPaths, debouncedParams.steps),
        probabilityAboveStart: accumulator.aboveStart / Math.max(1, accumulator.pathCount),
      }),
    },
    [
      debouncedParams.initialPrice, debouncedParams.drift, debouncedParams.volatility,
      debouncedParams.steps, debouncedParams.simulations, debouncedParams.horizonYears,
      debouncedParams.seed,
    ],
  );

  /* ---- Comparison run: identical seed, different volatility ---- */
  const comparison = useMemo(() => {
    // Capped at 1,200 paths so the comparison is instant and never competes with
    // the main simulation for the main thread.
    const count = Math.min(1200, debouncedParams.simulations);
    const runFor = (volatility: number) => {
      const accumulator: Accumulator = {
        endingPrices: [], maxDrawdowns: [], storedPaths: [],
        pathSum: new Float64Array(0), pathCount: 0, aboveStart: 0,
      };
      for (let i = 0; i < count; i++) {
        simulateOnePath(accumulator, i, { ...debouncedParams, volatility });
      }
      return accumulator;
    };
    // Using the SAME seed for both runs is what makes this a controlled
    // comparison: the random draws are identical, so every difference in the
    // output is attributable to volatility alone.
    const low = runFor(debouncedParams.volatility);
    const high = runFor(compareVolatility);
    return { count, low, high };
  }, [debouncedParams, compareVolatility]);

  const stats = useMemo(() => {
    if (!simulation.result) return null;
    const { endingPrices, maxDrawdowns } = simulation.result;
    if (endingPrices.length === 0) return null;
    return {
      mean: mean(endingPrices),
      median: median(endingPrices),
      sd: endingPrices.length > 1 ? standardDeviation(endingPrices, 1) : 0,
      p5: percentile(endingPrices, 5),
      p25: percentile(endingPrices, 25),
      p75: percentile(endingPrices, 75),
      p95: percentile(endingPrices, 95),
      min: Math.min(...endingPrices),
      max: Math.max(...endingPrices),
      skew: skewness(endingPrices),
      excessKurtosis: kurtosis(endingPrices),
      meanDrawdown: mean(maxDrawdowns),
      medianDrawdown: median(maxDrawdowns),
      worstDrawdown: Math.max(...maxDrawdowns),
      p95Drawdown: percentile(maxDrawdowns, 95),
    };
  }, [simulation.result]);

  /* ---- Theoretical values, for comparison against the simulation ---- */
  const theory = useMemo(() => {
    const { initialPrice, drift, volatility, horizonYears } = params;
    // Under GBM, ln(S_T) ~ N(ln(S0) + (mu - sigma^2/2)T, sigma^2 T).
    const logMean = Math.log(initialPrice) + (drift - (volatility * volatility) / 2) * horizonYears;
    const logSd = volatility * Math.sqrt(horizonYears);
    return {
      expectedPrice: initialPrice * Math.exp(drift * horizonYears),
      medianPrice: Math.exp(logMean),
      logMean,
      logSd,
      // P(S_T > S_0) = P(Z > -(mu - sigma^2/2)T / (sigma sqrt(T)))
      probabilityAbove:
        1 - normalCdfLocal((Math.log(initialPrice) - logMean) / logSd),
      sdPrice:
        initialPrice *
        Math.exp(drift * horizonYears) *
        Math.sqrt(Math.exp(volatility * volatility * horizonYears) - 1),
    };
  }, [params]);

  const histogramBins = useMemo(() => {
    if (!simulation.result || simulation.result.endingPrices.length < 10) return [];
    return histogram(simulation.result.endingPrices, 44);
  }, [simulation.result]);

  /** The analytic log-normal density, drawn over the histogram. */
  const densityCurve = useMemo(() => {
    if (histogramBins.length === 0) return undefined;
    const lo = histogramBins[0].binStart;
    const hi = histogramBins[histogramBins.length - 1].binEnd;
    const curve: { x: number; y: number }[] = [];
    const stepSize = (hi - lo) / 200;
    for (let s = lo + stepSize; s < hi; s += stepSize) {
      if (s <= 0) continue;
      // Change of variables from ln(S) to S introduces the 1/s factor.
      curve.push({ x: s, y: normalPDF(Math.log(s), theory.logMean, theory.logSd) / s });
    }
    return curve;
  }, [histogramBins, theory]);

  const config = {
    initialPrice: params.initialPrice,
    drift: params.drift,
    volatility: params.volatility,
    steps: params.steps,
    simulations: params.simulations,
    horizonYears: params.horizonYears,
    seed: params.seed,
  };

  const configLabels = MONTE_CARLO_LABELS;

  return (
    <LabShell
      lab={lab}
      question="If a price follows geometric Brownian motion with a known drift and volatility, what is the distribution of its value one horizon from now — and how much of that distribution is an artefact of the model's assumptions rather than a property of markets?"
    >
      {/* ---------------- Inputs ---------------- */}
      <ExperimentSection kind="inputs">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Parameters" subtitle="Change anything; the simulation reruns automatically." />
            <CardBody className="space-y-4">
              <NumberField
                label="Initial price S₀"
                value={params.initialPrice}
                onChange={(v) => update("initialPrice", Math.max(0.01, v))}
                min={0.01}
                step={10}
                suffix="$"
                hint="The starting level. Because GBM is multiplicative, this only rescales the whole picture — it never changes the shape of the distribution of returns."
                error={params.initialPrice <= 0 ? "Must be greater than zero." : undefined}
              />
              <SliderControl
                label="Expected annual return"
                symbol={<InlineMath>{"\\mu"}</InlineMath>}
                value={params.drift}
                min={-0.3}
                max={0.4}
                step={0.005}
                onChange={(v) => update("drift", v)}
                format={(v) => percent(v, 1)}
                hint="The drift: the average continuously-compounded growth rate per year. In this model it is assumed constant and known, which is the single most unrealistic assumption here."
              />
              <SliderControl
                label="Annual volatility"
                symbol={<InlineMath>{"\\sigma"}</InlineMath>}
                value={params.volatility}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => update("volatility", v)}
                format={(v) => percent(v, 0)}
                hint="The standard deviation of annual log returns. Raising it widens the distribution and — through the Itô correction — lowers the median outcome even though the mean is unchanged."
              />
              <SliderControl
                label="Trading days"
                value={params.steps}
                min={21}
                max={1260}
                step={21}
                onChange={(v) => update("steps", v)}
                format={(v) => integer(v)}
                hint="The number of discrete steps. More steps give a finer approximation to continuous time, but because we use the exact solution rather than an Euler step, the terminal distribution is correct even for coarse grids."
              />
              <SliderControl
                label="Horizon"
                value={params.horizonYears}
                min={0.25}
                max={10}
                step={0.25}
                onChange={(v) => update("horizonYears", v)}
                format={(v) => `${v} yr`}
                hint="How far into the future to simulate. Uncertainty grows with the square root of time, so a four-year horizon is twice as uncertain as a one-year horizon, not four times."
              />
              <SelectField
                label="Simulations"
                value={String(params.simulations)}
                options={SIMULATION_OPTIONS}
                onChange={(v) => update("simulations", Number(v))}
                hint="More paths estimate the distribution more precisely. The error of any statistic falls as 1/√N, so 100× the paths gives 10× the precision."
              />
              <NumberField
                label="Random seed"
                value={params.seed}
                onChange={(v) => update("seed", Math.max(0, Math.floor(v)))}
                min={0}
                step={1}
                hint="Fixing the seed makes the run reproducible: the same seed always produces the same paths. Change it to see how much of what you are looking at is luck."
              />
              <div className="flex gap-2 border-t border-line pt-3">
                <Button size="sm" onClick={() => update("seed", Math.floor(Math.random() * 1_000_000))}>
                  New seed
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setParams(MONTE_CARLO_DEFAULTS)}>
                  Reset
                </Button>
              </div>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Simulated price paths"
                subtitle={`${integer(params.simulations)} paths simulated; up to ${MAX_STORED_PATHS} drawn individually.`}
                actions={<Toggle label="Percentile bands" checked={showBands} onChange={setShowBands} />}
              />
              <CardBody>
                {simulation.error ? (
                  <ErrorState
                    title="The simulation could not run"
                    description={simulation.error}
                    onRetry={() => setParams(MONTE_CARLO_DEFAULTS)}
                  />
                ) : simulation.loading ? (
                  <SimulationProgress progress={simulation.progress} label="Simulating paths" />
                ) : simulation.result ? (
                  <PathBundleChart
                    paths={simulation.result.storedPaths}
                    percentiles={showBands ? simulation.result.percentileBands ?? undefined : undefined}
                    title="Price paths"
                    description={`${integer(params.simulations)} geometric Brownian motion paths starting at ${currency(params.initialPrice, 0)}, spreading out over ${params.horizonYears} year${params.horizonYears === 1 ? "" : "s"}. The shaded bands show the 5th-to-95th and 25th-to-75th percentile ranges across paths.`}
                    yLabel="Price"
                    xLabel="Trading day"
                    formatY={(v) => `$${v.toFixed(0)}`}
                    initialValue={params.initialPrice}
                    height={330}
                    footnote={
                      simulation.result.percentileBands === null
                        ? "Percentile bands need at least 20 paths to be meaningful, so they are hidden at this simulation count."
                        : `Bands are computed across the ${Math.min(MAX_STORED_PATHS, params.simulations)} stored paths at each time step. The dashed line marks the starting price.`
                    }
                  />
                ) : null}
              </CardBody>
            </Card>
          </div>
        </div>
      </ExperimentSection>

      {/* ---------------- Model ---------------- */}
      <ExperimentSection kind="model">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="The stochastic differential equation" />
            <CardBody className="space-y-3">
              <EquationBlock
                equation={"dS_t = \\mu S_t\\,dt + \\sigma S_t\\,dW_t"}
                description="The change in price over an instant has a predictable part proportional to the current price, and a random part also proportional to the current price."
                where={[
                  { symbol: "S_t", meaning: "the price at time t" },
                  { symbol: "\\mu", meaning: "the expected growth rate per year (the drift)" },
                  { symbol: "\\sigma", meaning: "the annualised volatility" },
                  { symbol: "dW_t", meaning: "an increment of a Wiener process: normally distributed, mean zero, variance dt, independent of everything before it" },
                ]}
              />
              <p className="text-xs leading-relaxed text-ink-muted">
                Both terms are multiplied by <InlineMath>{"S_t"}</InlineMath>. That is what makes the model
                multiplicative rather than additive: a $500 stock moves in larger dollar steps than a $5 stock,
                but in the same <em>percentage</em> steps. It is also why the price can never go negative — to
                reach zero it would have to fall by 100% in one instant, and the step sizes shrink in
                proportion to the price.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="The exact discrete solution" />
            <CardBody className="space-y-3">
              <EquationBlock
                equation={"S_{t+\\Delta t} = S_t \\exp\\!\\left[\\left(\\mu - \\tfrac{\\sigma^2}{2}\\right)\\Delta t + \\sigma\\sqrt{\\Delta t}\\, Z\\right]"}
                description="This is what the code actually computes, once per step."
                where={[
                  { symbol: "Z \\sim N(0,1)", meaning: "an independent standard normal draw at each step" },
                  { symbol: "\\Delta t", meaning: "the length of one step in years — here, horizon ÷ steps" },
                ]}
              />
              <Callout tone="accent" title="Why the −σ²/2 term exists">
                <p>
                  This is the Itô correction, and it is not a fudge factor. The exponential function is convex,
                  so <InlineMath>{"E[e^X] > e^{E[X]}"}</InlineMath>. Exponentiating a zero-mean random variable
                  produces something whose <em>mean is above 1</em>. Without subtracting{" "}
                  <InlineMath>{"\\sigma^2/2"}</InlineMath>, volatility alone would manufacture free expected
                  growth, and the realised average return would come out higher than the{" "}
                  <InlineMath>{"\\mu"}</InlineMath> you asked for.
                </p>
                <p>
                  With it, <InlineMath>{"E[S_T] = S_0 e^{\\mu T}"}</InlineMath> exactly. The consequence is
                  that the <strong>median</strong> path grows at{" "}
                  <InlineMath>{"\\mu - \\sigma^2/2"}</InlineMath> while the <strong>mean</strong> grows at{" "}
                  <InlineMath>{"\\mu"}</InlineMath>. At σ = {percent(params.volatility, 0)} that gap is{" "}
                  {percent((params.volatility * params.volatility) / 2, 2)} per year — the mean is pulled
                  upward by a thin tail of enormous outcomes that the typical path never experiences.
                </p>
              </Callout>
            </CardBody>
          </Card>
        </div>

        <ResearchOnly>
          <Card className="mt-4">
            <CardHeader
              title="Analytic results, and how the simulation compares"
              subtitle="Because this model has a closed form, we can check the simulator against the exact answer — the strongest available test that the code is correct."
            />
            <CardBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <EquationBlock
                  label="Terminal distribution"
                  equation={"\\ln S_T \\sim N\\!\\left(\\ln S_0 + \\left(\\mu - \\tfrac{\\sigma^2}{2}\\right)T,\; \\sigma^2 T\\right)"}
                  description="The log price is exactly normal, which is the same as saying the price itself is log-normal."
                />
                <EquationBlock
                  label="Probability of ending above the start"
                  equation={"P(S_T > S_0) = \\Phi\\!\\left(\\frac{\\left(\\mu - \\sigma^2/2\\right)T}{\\sigma\\sqrt{T}}\\right)"}
                  description="Note that this falls as volatility rises, even with the drift held constant."
                />
              </div>
              {stats ? (
                <DataTable
                  columns={["Quantity", "Simulated", "Analytic", "Difference"]}
                  align={["left", "right", "right", "right"]}
                  caption="Agreement between the simulation and the closed-form solution. Differences shrink as the number of paths rises."
                  rows={[
                    [
                      "Mean ending price",
                      currency(stats.mean),
                      currency(theory.expectedPrice),
                      percent(stats.mean / theory.expectedPrice - 1, 2),
                    ],
                    [
                      "Median ending price",
                      currency(stats.median),
                      currency(theory.medianPrice),
                      percent(stats.median / theory.medianPrice - 1, 2),
                    ],
                    [
                      "Standard deviation",
                      currency(stats.sd),
                      currency(theory.sdPrice),
                      percent(stats.sd / theory.sdPrice - 1, 2),
                    ],
                    [
                      "P(ending above start)",
                      percent(simulation.result?.probabilityAboveStart ?? 0, 2),
                      percent(theory.probabilityAbove, 2),
                      percent((simulation.result?.probabilityAboveStart ?? 0) - theory.probabilityAbove, 2),
                    ],
                  ]}
                />
              ) : null}
            </CardBody>
          </Card>
        </ResearchOnly>
      </ExperimentSection>

      {/* ---------------- Assumptions ---------------- */}
      <ExperimentSection kind="assumptions">
        <Card>
          <CardHeader
            title="What this model takes for granted"
            subtitle="Listed before the results, not after them. Each of these is false about real markets in a specific, measurable way."
          />
          <CardBody>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[
                {
                  title: "Constant drift",
                  body: "μ never changes over the whole horizon. Real expected returns vary with valuations, interest rates and the business cycle — and are so hard to estimate that a decade of data barely constrains them.",
                },
                {
                  title: "Constant volatility",
                  body: "σ is a single fixed number. Real volatility clusters: calm follows calm and turbulence follows turbulence. This is the assumption that GARCH and stochastic-volatility models exist to relax.",
                },
                {
                  title: "Continuous price paths",
                  body: "The price moves smoothly, never jumping. Real prices gap overnight and on news, and an option hedger who assumes continuity cannot hedge a gap.",
                },
                {
                  title: "Log-normal prices",
                  body: "Returns are exactly normal in logs, so a 5σ day has probability about 1 in 3.5 million. Real equity markets deliver them every few years.",
                },
                {
                  title: "Independent returns",
                  body: "Each step's random draw is independent of every previous one. This makes the price a martingale after drift and rules out momentum and mean reversion by construction.",
                },
                {
                  title: "No frictions",
                  body: "No transaction costs, no bid-ask spread, no market impact, no taxes, infinite liquidity at the quoted price. The Backtesting Lab exists largely to show how much this one matters.",
                },
              ].map((item) => (
                <div key={item.title} className="border-l-2 border-line pl-3">
                  <p className="text-xs font-semibold text-ink">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">{item.body}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </ExperimentSection>

      {/* ---------------- Volatility comparison ---------------- */}
      <ExperimentSection kind="simulation" title="What happens when volatility increases?">
        <Card>
          <CardHeader
            title="A controlled comparison"
            subtitle="Both runs use the identical random seed, so the only thing that differs between them is σ. Any difference you see is caused by volatility, not by luck."
          />
          <CardBody className="space-y-4">
            <div className="max-w-sm">
              <SliderControl
                label="Comparison volatility"
                symbol={<InlineMath>{"\\sigma_B"}</InlineMath>}
                value={compareVolatility}
                min={0.01}
                max={1}
                step={0.01}
                onChange={setCompareVolatility}
                format={(v) => percent(v, 0)}
                hint="The second scenario's volatility. The first uses the σ from the main control panel."
              />
            </div>

            {(() => {
              const lowPrices = comparison.low.endingPrices;
              const highPrices = comparison.high.endingPrices;
              if (lowPrices.length === 0 || highPrices.length === 0) return null;
              const summarise = (prices: number[], drawdowns: number[]) => ({
                mean: mean(prices),
                median: median(prices),
                sd: prices.length > 1 ? standardDeviation(prices, 1) : 0,
                p5: percentile(prices, 5),
                p95: percentile(prices, 95),
                above: prices.filter((p) => p > params.initialPrice).length / prices.length,
                drawdown: median(drawdowns),
              });
              const a = summarise(lowPrices, comparison.low.maxDrawdowns);
              const b = summarise(highPrices, comparison.high.maxDrawdowns);

              return (
                <>
                  <DataTable
                    columns={[
                      "Statistic",
                      `A: σ = ${percent(params.volatility, 0)}`,
                      `B: σ = ${percent(compareVolatility, 0)}`,
                      "Change",
                    ]}
                    align={["left", "right", "right", "right"]}
                    caption={`Both scenarios: ${integer(comparison.count)} paths, μ = ${percent(params.drift, 1)}, seed ${params.seed}.`}
                    rows={[
                      ["Mean ending price", currency(a.mean), currency(b.mean), percent(b.mean / a.mean - 1, 1)],
                      ["Median ending price", currency(a.median), currency(b.median), percent(b.median / a.median - 1, 1)],
                      ["Standard deviation", currency(a.sd), currency(b.sd), percent(b.sd / a.sd - 1, 1)],
                      ["5th percentile", currency(a.p5), currency(b.p5), percent(b.p5 / a.p5 - 1, 1)],
                      ["95th percentile", currency(a.p95), currency(b.p95), percent(b.p95 / a.p95 - 1, 1)],
                      ["P(above start)", percent(a.above, 1), percent(b.above, 1), `${((b.above - a.above) * 100).toFixed(1)} pp`],
                      ["Median max drawdown", percent(a.drawdown, 1), percent(b.drawdown, 1), `${((b.drawdown - a.drawdown) * 100).toFixed(1)} pp`],
                    ]}
                  />

                  <SimpleBarChart
                    data={[
                      { metric: "Median", A: a.median, B: b.median },
                      { metric: "Mean", A: a.mean, B: b.mean },
                      { metric: "5th pct", A: a.p5, B: b.p5 },
                      { metric: "95th pct", A: a.p95, B: b.p95 },
                    ]}
                    xKey="metric"
                    bars={[
                      { key: "A", label: `σ = ${percent(params.volatility, 0)}`, color: "var(--series-1)" },
                      { key: "B", label: `σ = ${percent(compareVolatility, 0)}`, color: "var(--series-5)" },
                    ]}
                    title="Scenario comparison"
                    description="Grouped bars comparing the mean, median and tail percentiles of the two volatility scenarios. The higher-volatility scenario has a lower median but a much higher 95th percentile."
                    formatY={(v) => `$${v.toFixed(0)}`}
                    height={240}
                  />

                  <FindingBlock
                    observation={
                      <>
                        Raising volatility from {percent(params.volatility, 0)} to{" "}
                        {percent(compareVolatility, 0)} changed the median ending price by{" "}
                        <strong className="text-ink">{percent(b.median / a.median - 1, 1)}</strong> and the
                        95th percentile by{" "}
                        <strong className="text-ink">{percent(b.p95 / a.p95 - 1, 1)}</strong>, while the mean
                        moved only {percent(b.mean / a.mean - 1, 1)}.
                      </>
                    }
                    interpretation={
                      <>
                        Volatility is not a symmetric widening of the distribution. The mean is pinned to{" "}
                        <InlineMath>{"S_0 e^{\\mu T}"}</InlineMath> by construction, so when the right tail
                        stretches upward, the bulk of the distribution must slide <em>downward</em> to
                        compensate. The median falls at rate <InlineMath>{"\\sigma^2/2"}</InlineMath> per year.
                        This is volatility drag, and it is why two investments with the same expected return
                        but different volatility are not equally good.
                      </>
                    }
                    conclusion={
                      <>
                        In this model, increasing volatility while holding expected return constant makes the
                        typical outcome worse and the average outcome unchanged. Reporting only the mean would
                        hide that entirely.
                      </>
                    }
                    limitation={
                      <>
                        This is a statement about geometric Brownian motion, not about markets. It holds
                        because we <em>defined</em> μ as the drift of a log-normal process with constant
                        volatility. In a market where volatility and expected return move together, the
                        comparison is not controlled and this conclusion does not transfer.
                      </>
                    }
                  />
                </>
              );
            })()}
          </CardBody>
        </Card>
      </ExperimentSection>

      {/* ---------------- Results ---------------- */}
      <ExperimentSection kind="results">
        {simulation.loading ? (
          <SimulationProgress progress={simulation.progress} label="Computing statistics" />
        ) : stats && simulation.result ? (
          <div className="space-y-4">
            <MetricGrid>
              <MetricCard
                label="Mean ending"
                value={currency(stats.mean)}
                hint="The average across all simulated paths. Pulled upward by the right tail, so it is not the typical outcome."
              />
              <MetricCard
                label="Median ending"
                value={currency(stats.median)}
                hint="The middle outcome: half the paths ended below this. For a skewed distribution this describes the typical experience far better than the mean."
              />
              <MetricCard
                label="Std deviation"
                value={currency(stats.sd)}
                hint="The spread of ending prices. Note it is in dollars, not percent, and grows with the horizon."
              />
              <MetricCard
                label="P(above start)"
                value={percent(simulation.result.probabilityAboveStart, 1)}
                tone={simulation.result.probabilityAboveStart > 0.5 ? "positive" : "negative"}
                hint="The fraction of paths ending above S₀. This falls as volatility rises even when the drift is unchanged, because of the Itô correction."
              />
              <MetricCard label="5th percentile" value={currency(stats.p5)} tone="negative" hint="5% of paths ended below this." />
              <MetricCard label="25th percentile" value={currency(stats.p25)} />
              <MetricCard label="75th percentile" value={currency(stats.p75)} />
              <MetricCard label="95th percentile" value={currency(stats.p95)} tone="positive" hint="5% of paths ended above this." />
            </MetricGrid>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title="Distribution of ending prices"
                  subtitle="With the analytic log-normal density drawn on top."
                />
                <CardBody>
                  {histogramBins.length > 0 ? (
                    <HistogramChart
                      bins={histogramBins}
                      title="Ending-price distribution"
                      description={`A right-skewed histogram of ${integer(simulation.result.endingPrices.length)} ending prices, with a long upper tail and a floor at zero. The orange curve is the exact log-normal density the model implies.`}
                      xLabel="Ending price ($)"
                      formatX={(v) => `$${v.toFixed(0)}`}
                      overlay={densityCurve}
                      markers={[
                        { value: params.initialPrice, label: "Start", color: "var(--ink-faint)" },
                        { value: stats.median, label: "Median", color: "var(--series-3)" },
                        { value: stats.mean, label: "Mean", color: "var(--series-2)" },
                      ]}
                      height={280}
                      footnote="The mean sits to the RIGHT of the median. That asymmetry is the signature of a log-normal distribution, and the reason an average return can describe almost nobody's actual experience."
                    />
                  ) : null}
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Maximum drawdown across paths"
                  subtitle="The deepest peak-to-trough fall each path experienced along the way."
                />
                <CardBody className="space-y-3">
                  <HistogramChart
                    bins={histogram(simulation.result.maxDrawdowns, 32)}
                    title="Maximum drawdown distribution"
                    description="Distribution of the worst peak-to-trough decline suffered by each path, concentrated at moderate values with a tail reaching toward total loss."
                    xLabel="Maximum drawdown"
                    formatX={(v) => percent(v, 0)}
                    markers={[{ value: stats.medianDrawdown, label: "Median", color: "var(--series-3)" }]}
                    height={200}
                  />
                  <MetricGrid className="sm:grid-cols-2 lg:grid-cols-2">
                    <MetricCard label="Median drawdown" value={percent(stats.medianDrawdown, 1)} tone="caution" />
                    <MetricCard label="Mean drawdown" value={percent(stats.meanDrawdown, 1)} tone="caution" />
                    <MetricCard label="95th pct drawdown" value={percent(stats.p95Drawdown, 1)} tone="negative" />
                    <MetricCard label="Worst observed" value={percent(stats.worstDrawdown, 1)} tone="negative" />
                  </MetricGrid>
                  <p className="text-2xs leading-relaxed text-ink-faint">
                    Drawdown is <strong className="text-ink-muted">path-dependent</strong>: unlike volatility,
                    it depends on the order in which the returns arrived. Two paths can end at exactly the same
                    price with completely different drawdowns, which is why it captures something volatility
                    cannot.
                  </p>
                </CardBody>
              </Card>
            </div>

            <ResearchOnly>
              <Card>
                <CardHeader title="Raw statistics" subtitle="Full numeric summary of the ending-price distribution." />
                <CardBody>
                  <DataTable
                    columns={["Statistic", "Value"]}
                    align={["left", "right"]}
                    rows={[
                      ["Paths simulated", integer(simulation.result.endingPrices.length)],
                      ["Mean", currency(stats.mean)],
                      ["Median", currency(stats.median)],
                      ["Standard deviation", currency(stats.sd)],
                      ["Minimum", currency(stats.min)],
                      ["Maximum", currency(stats.max)],
                      ["5th / 25th / 75th / 95th percentile", `${currency(stats.p5)} / ${currency(stats.p25)} / ${currency(stats.p75)} / ${currency(stats.p95)}`],
                      ["Skewness", ratio(stats.skew, 3)],
                      ["Excess kurtosis", ratio(stats.excessKurtosis, 3)],
                      ["Mean maximum drawdown", percent(stats.meanDrawdown, 2)],
                      ["Standard error of the mean", currency(stats.sd / Math.sqrt(simulation.result.endingPrices.length))],
                    ]}
                    caption="The standard error tells you how precisely the simulation has pinned down the true mean. Quadrupling the paths halves it."
                  />
                </CardBody>
              </Card>
            </ResearchOnly>
          </div>
        ) : null}
      </ExperimentSection>

      {/* ---------------- Interpretation ---------------- */}
      <ExperimentSection kind="interpretation">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="How to read this output" />
            <CardBody className="space-y-2.5 text-xs leading-relaxed text-ink-muted">
              <p>
                <strong className="text-ink">The output is a distribution, not a forecast.</strong> The right
                question is never &ldquo;what will the price be?&rdquo; but &ldquo;given these assumptions, how
                wide is the range of outcomes, and how is the probability spread across it?&rdquo;
              </p>
              <p>
                <strong className="text-ink">Use the median for the typical case.</strong> With{" "}
                {percent(params.volatility, 0)} volatility over {params.horizonYears} year
                {params.horizonYears === 1 ? "" : "s"}, the mean exceeds the median by{" "}
                {stats ? percent(stats.mean / stats.median - 1, 1) : "—"}. Quoting the mean as
                &ldquo;expected&rdquo; is technically correct and practically misleading.
              </p>
              <p>
                <strong className="text-ink">The tails are the model&rsquo;s weakest region.</strong> The 5th
                and 95th percentiles come from an assumption of normally distributed log returns. That
                assumption is least accurate exactly where these numbers live, so treat them as the <em>most</em>{" "}
                suspect outputs on the page, not the most interesting ones.
              </p>
              <p>
                <strong className="text-ink">Change the seed before believing anything.</strong> If a
                conclusion flips when you change the seed, you were looking at sampling noise. This is the
                cheapest robustness check in all of quantitative work.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="When does this model fail?" />
            <CardBody>
              <div className="space-y-3">
                {[
                  {
                    title: "Fat tails",
                    body: "GBM says a 5σ daily move happens about once every 14,000 years. Equity markets produce them every few years. The Gaussian assumption understates crash probability by orders of magnitude — which matters most precisely when it matters most.",
                  },
                  {
                    title: "Volatility clustering",
                    body: "Real volatility is autocorrelated: turbulent days cluster together. GBM has one fixed σ and cannot produce a calm decade followed by a violent year. See the Market Regime Simulator for a model that can.",
                  },
                  {
                    title: "Regime changes",
                    body: "The parameters themselves shift. A μ and σ estimated from one decade can be badly wrong in the next, and nothing in the model warns you when that has happened.",
                  },
                  {
                    title: "Jumps",
                    body: "Prices gap on news and overnight. A continuous process cannot represent a discontinuity, and a hedging strategy that assumes continuity fails exactly at the gap.",
                  },
                  {
                    title: "Changing correlations",
                    body: "In multi-asset settings, correlations rise toward 1 during crises. Diversification computed in calm conditions evaporates when it is needed, a pattern no constant-correlation model reproduces.",
                  },
                ].map((item) => (
                  <div key={item.title} className="rounded-card border border-caution/30 bg-caution/5 px-3 py-2.5">
                    <p className="text-xs font-semibold text-caution">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">{item.body}</p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </ExperimentSection>

      {/* ---------------- Limitations ---------------- */}
      <ExperimentSection kind="limitations">
        <Callout tone="caution" title="This does not predict real stock prices, and cannot">
          <p>
            Every path on this page was generated from a random number generator using parameters that{" "}
            <strong className="text-ink-muted">you typed in</strong>. The simulation contains no market data,
            no information about any company, and no forecasting mechanism of any kind. If you set μ to 30%,
            the simulation will dutifully show you a 30% drift, because you asked for one.
          </p>
          <p>
            What a Monte Carlo simulation can legitimately tell you is the logical consequence of a set of
            assumptions: <em>if</em> returns behaved like this, <em>then</em> the distribution of outcomes
            would look like that. The value is in the conditional, and in discovering that the conditional is
            often surprising — the volatility drag result above is a genuine insight about compounding, not
            about any particular asset.
          </p>
          <p>
            The hard, unsolved part of quantitative finance is estimating μ and σ in the first place, and
            knowing when they have changed. The simulation takes them as given. That is the entire difficulty,
            assumed away in a single input field.
          </p>
        </Callout>
      </ExperimentSection>

      {/* ---------------- Reproducibility ---------------- */}
      <ReproducibilityPanel
        title="Monte Carlo Market Simulator"
        prefix="MC"
        config={config}
        labels={configLabels}
        basePath="/labs/monte-carlo"
        exports={
          simulation.result
            ? [
                {
                  label: "Export ending prices (CSV)",
                  filename: `quantlab-montecarlo-${params.seed}.csv`,
                  mime: "text/csv",
                  build: () =>
                    toCSV(
                      simulation.result!.endingPrices.map((price, i) => ({
                        path: i,
                        ending_price: price.toFixed(6),
                        max_drawdown: simulation.result!.maxDrawdowns[i].toFixed(6),
                      })),
                    ),
                },
                {
                  label: "Export configuration (JSON)",
                  filename: `quantlab-montecarlo-${params.seed}.json`,
                  mime: "application/json",
                  build: () =>
                    JSON.stringify(
                      {
                        experiment: "Monte Carlo Market Simulator",
                        model: "Geometric Brownian motion, exact discretisation",
                        parameters: config,
                        results: stats
                          ? {
                              mean_ending_price: stats.mean,
                              median_ending_price: stats.median,
                              standard_deviation: stats.sd,
                              percentiles: { p5: stats.p5, p25: stats.p25, p75: stats.p75, p95: stats.p95 },
                              probability_above_start: simulation.result!.probabilityAboveStart,
                              mean_max_drawdown: stats.meanDrawdown,
                              skewness: stats.skew,
                              excess_kurtosis: stats.excessKurtosis,
                            }
                          : null,
                        analytic_comparison: {
                          expected_price: theory.expectedPrice,
                          median_price: theory.medianPrice,
                          probability_above_start: theory.probabilityAbove,
                        },
                        note: "Synthetic data generated in-browser. Not a forecast of any real asset.",
                      },
                      null,
                      2,
                    ),
                },
              ]
            : []
        }
      />
    </LabShell>
  );
}

/**
 * A local copy of the normal CDF so this component does not need to import the
 * whole distributions module into the theory calculation path.
 */
function normalCdfLocal(z: number): number {
  // Abramowitz-Stegun 26.2.17 is sufficient here: this value is only displayed,
  // never used in a derivative, and is accurate to about 7.5e-8.
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly =
    t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const upper = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI) * poly;
  return z >= 0 ? 1 - upper : upper;
}
