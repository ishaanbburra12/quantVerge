"use client";

import { useMemo, useState } from "react";
import { useDebounced } from "@/lib/hooks/useBatchedSimulation";
import {
  Button, Callout, Card, CardBody, CardHeader, MetricCard, MetricGrid,
  SliderControl, NumberField, SelectField, Toggle, DataTable, Tabs,
} from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";
import { ExperimentSection, FindingBlock, ResearchOnly } from "@/components/labs/ExperimentSection";
import { LabShell, ReproducibilityPanel } from "@/components/labs/LabShell";
import { EquityChart, MultiLineChart, SimpleBarChart } from "@/components/charts";
import { generateAR1, generateRegimeMarket, DEFAULT_REGIMES } from "@/lib/simulation/generators";
import { buildTransitionMatrix } from "@/lib/labs/marketRegimes";
import { pricesFromReturns } from "@/lib/finance/performance";
import {
  autocorrelationFunction, autocorrelationConfidenceBand, rollingMean, rollingVolatility,
  mean, standardDeviation, skewness, kurtosis, autocorrelation,
} from "@/lib/statistics/descriptive";
import { toCSV } from "@/lib/experiment/config";
import { percent, ratio, integer } from "@/lib/format";
import type { LabMeta } from "@/content/labs";
import {
  RANDOM_WALK_DEFAULTS, RANDOM_WALK_LABELS, MODE_LABELS, MODE_SUMMARIES,
  type RandomWalkParams, type WalkMode,
} from "@/lib/labs/randomWalk";

const REGIME_COLORS = ["var(--regime-bull)", "var(--regime-bear)", "var(--regime-sideways)"];
const REGIME_NAMES = ["Bull", "Bear", "Sideways"];

type ViewTab = "price" | "returns" | "rolling" | "acf";

export function RandomWalkLab({ lab, initialParams }: { lab: LabMeta; initialParams: RandomWalkParams }) {
  const [liveParams, setParams] = useState<RandomWalkParams>(initialParams);
  /**
   * `liveParams` updates on every mousemove so the slider thumb tracks the
   * finger. Everything downstream — the simulation AND the chart props — reads
   * the debounced copy instead, so dragging triggers one recompute and one chart
   * render rather than one per pixel. The chart captions are also more honest
   * this way: they describe the parameters that were actually simulated, not a
   * value the slider is still travelling through.
   */
  const params = useDebounced(liveParams, 160);
  const [showHiddenState, setShowHiddenState] = useState(false);
  const [view, setView] = useState<ViewTab>("price");

  const update = <K extends keyof RandomWalkParams>(key: K, value: RandomWalkParams[K]) =>
    setParams((previous) => ({ ...previous, [key]: value }));

  const series = useMemo(() => {
    if (params.mode === "regimeSwitching") {
      const result = generateRegimeMarket({
        regimes: DEFAULT_REGIMES.map((r) => ({ ...r, volatility: r.volatility * (params.volatility / 0.2) })),
        transition: buildTransitionMatrix(0.97, 0.93, 0.95),
        steps: params.steps,
        seed: params.seed,
        initialPrice: 100,
      });
      return { returns: result.returns, prices: result.prices, regimes: result.regimes };
    }

    const phi =
      params.mode === "randomWalk" ? 0 : params.mode === "momentum" ? params.phi : -params.phi;
    const rets = generateAR1({
      drift: params.drift,
      volatility: params.volatility,
      phi,
      steps: params.steps,
      seed: params.seed,
    });
    return { returns: rets, prices: pricesFromReturns(rets, 100), regimes: undefined };
  }, [params.mode, params.phi, params.drift, params.volatility, params.steps, params.seed]);

  const acf = useMemo(
    () => autocorrelationFunction(series.returns, params.maxLag),
    [series.returns, params.maxLag],
  );
  const band = useMemo(
    () => autocorrelationConfidenceBand(series.returns.length),
    [series.returns.length],
  );

  /**
   * Autocorrelation of SQUARED returns.
   *
   * This is the single most useful diagnostic on the page. Squared returns are a
   * proxy for variance, so their autocorrelation measures whether volatility
   * clusters. A random walk and a regime-switching market can have identical
   * (near-zero) return autocorrelation while differing enormously here — which is
   * exactly the situation in real markets, where returns are nearly unpredictable
   * but volatility is strongly predictable.
   */
  const squaredAcf = useMemo(() => {
    const squared = series.returns.map((r) => r * r);
    return autocorrelationFunction(squared, params.maxLag);
  }, [series.returns, params.maxLag]);

  const rollingVol = useMemo(
    () => rollingVolatility(series.returns, params.rollingWindow, 252),
    [series.returns, params.rollingWindow],
  );
  const rollingRet = useMemo(
    () => rollingMean(series.returns, params.rollingWindow).map((v) => (v === null ? null : v * 252)),
    [series.returns, params.rollingWindow],
  );

  const stats = useMemo(
    () => ({
      annualDrift: mean(series.returns) * 252,
      annualVol: standardDeviation(series.returns, 1) * Math.sqrt(252),
      skew: skewness(series.returns),
      excessKurtosis: kurtosis(series.returns),
      lag1: autocorrelation(series.returns, 1),
      lag1Squared: autocorrelation(series.returns.map((r) => r * r), 1),
      significantLags: acf.filter((v) => Math.abs(v) > band).length,
    }),
    [series.returns, acf, band],
  );

  const regimeBlocks = useMemo(() => {
    if (!series.regimes) return undefined;
    const blocks: { start: number; end: number; color: string; name: string }[] = [];
    let start = 0;
    for (let i = 1; i <= series.regimes.length; i++) {
      if (i === series.regimes.length || series.regimes[i] !== series.regimes[start]) {
        const state = series.regimes[start];
        blocks.push({ start, end: i - 1, color: REGIME_COLORS[state], name: REGIME_NAMES[state] });
        start = i;
      }
    }
    return blocks;
  }, [series.regimes]);

  const config: Record<string, number | string> = { ...params };

  return (
    <LabShell
      lab={lab}
      question="Four processes produce price charts that look broadly similar. Which statistics actually distinguish them, and which do not?"
    >
      <ExperimentSection kind="inputs">
        <div className="grid gap-4 lg:grid-cols-[310px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Process" />
            <CardBody className="space-y-4">
              <SelectField
                label="Data-generating process"
                value={liveParams.mode}
                options={(Object.keys(MODE_LABELS) as WalkMode[]).map((m) => ({ value: m, label: MODE_LABELS[m] }))}
                onChange={(v) => update("mode", v)}
              />
              <p className="rounded-card border border-line bg-surface-sunken px-3 py-2 text-2xs leading-relaxed text-ink-muted">
                {MODE_SUMMARIES[params.mode]}
              </p>

              {params.mode === "momentum" || params.mode === "meanReversion" ? (
                <SliderControl
                  label="Memory strength"
                  symbol={<InlineMath>{"|\\varphi|"}</InlineMath>}
                  value={liveParams.phi}
                  min={0} max={0.6} step={0.01}
                  onChange={(v) => update("phi", v)}
                  format={(v) => v.toFixed(2)}
                  hint="The AR(1) coefficient's magnitude. Stationarity requires |φ| < 1. Real daily equity returns have |φ| below about 0.05, so anything above 0.2 here is far more predictable than any real market."
                />
              ) : null}

              <SliderControl
                label="Annual drift"
                value={liveParams.drift}
                min={-0.2} max={0.25} step={0.005}
                onChange={(v) => update("drift", v)}
                format={(v) => percent(v, 1)}
              />
              <SliderControl
                label="Annual volatility"
                value={liveParams.volatility}
                min={0.05} max={0.6} step={0.01}
                onChange={(v) => update("volatility", v)}
                format={(v) => percent(v, 0)}
              />
              <SliderControl
                label="Trading days"
                value={liveParams.steps}
                min={252} max={5040} step={252}
                onChange={(v) => update("steps", v)}
                format={(v) => `${integer(v)} (${(v / 252).toFixed(0)}y)`}
              />
              <SliderControl
                label="Rolling window"
                value={liveParams.rollingWindow}
                min={10} max={120} step={5}
                onChange={(v) => update("rollingWindow", v)}
                format={(v) => `${v} days`}
              />
              <SliderControl
                label="Maximum lag"
                value={liveParams.maxLag}
                min={5} max={50} step={1}
                onChange={(v) => update("maxLag", v)}
                format={(v) => String(v)}
              />
              <NumberField
                label="Random seed"
                value={liveParams.seed}
                onChange={(v) => update("seed", Math.max(0, Math.floor(v)))}
                min={0} step={1}
              />
              <div className="flex gap-2 border-t border-line pt-3">
                <Button size="sm" onClick={() => update("seed", Math.floor(Math.random() * 1_000_000))}>
                  New seed
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setParams(RANDOM_WALK_DEFAULTS)}>
                  Reset
                </Button>
              </div>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader
                title="The series"
                actions={
                  series.regimes ? (
                    <Toggle label="Show hidden state" checked={showHiddenState} onChange={setShowHiddenState} />
                  ) : undefined
                }
              />
              <CardBody className="space-y-3">
                <Tabs
                  ariaLabel="View"
                  active={view}
                  onChange={setView}
                  tabs={[
                    { value: "price", label: "Price" },
                    { value: "returns", label: "Returns" },
                    { value: "rolling", label: "Rolling statistics" },
                    { value: "acf", label: "Autocorrelation" },
                  ]}
                />

                {view === "price" ? (
                  <EquityChart
                    series={[{ key: "price", label: "Price", values: series.prices, color: "var(--series-1)", width: 1.6 }]}
                    title="Price path"
                    description="The simulated price series. At a glance, all four processes produce charts that look broadly similar — which is the point of the lab."
                    regimes={showHiddenState ? regimeBlocks : undefined}
                    formatY={(v) => `$${v.toFixed(0)}`}
                    yLabel="Price"
                    height={300}
                    footnote="Look at this chart and try to name the process. Then check the autocorrelation tab. Eyeballing a price chart is close to useless for identifying structure."
                  />
                ) : null}

                {view === "returns" ? (
                  <MultiLineChart
                    series={[{ key: "r", label: "Daily return", values: series.returns, color: "var(--series-1)", width: 0.8 }]}
                    title="Daily returns"
                    description="Daily returns over time. Clusters of large moves indicate volatility clustering; an even band indicates constant volatility."
                    xLabel="Trading day"
                    yLabel="Return"
                    formatY={(v) => percent(v, 1)}
                    referenceY={0}
                    height={300}
                    showLegend={false}
                  />
                ) : null}

                {view === "rolling" ? (
                  <MultiLineChart
                    series={[
                      { key: "vol", label: `${params.rollingWindow}-day volatility`, values: rollingVol, color: "var(--series-5)" },
                      { key: "ret", label: `${params.rollingWindow}-day annualised return`, values: rollingRet, color: "var(--series-3)" },
                    ]}
                    title="Rolling mean and volatility"
                    description="Trailing annualised return and volatility. Stable volatility indicates a homogeneous process; swings indicate regime changes or clustering."
                    xLabel="Trading day"
                    yLabel="Annualised"
                    formatY={(v) => percent(v, 0)}
                    referenceY={0}
                    height={300}
                    footnote="The rolling return is far noisier than the rolling volatility, at every window length. That is the same lesson as the Market Regime Lab: second moments are estimable from short samples and first moments are not."
                  />
                ) : null}

                {view === "acf" ? (
                  <div className="space-y-4">
                    <SimpleBarChart
                      data={acf.map((v, i) => ({ lag: String(i + 1), acf: v, upper: band, lower: -band }))}
                      xKey="lag"
                      bars={[{ key: "acf", label: "Autocorrelation of returns", color: "var(--series-1)" }]}
                      title="Autocorrelation function of returns"
                      description={`Bars showing the correlation between a return and the return ${params.maxLag} days earlier, for each lag. Bars inside the confidence band are indistinguishable from zero.`}
                      formatY={(v) => v.toFixed(3)}
                      height={240}
                      footnote={`The 95% band for white noise is ±${ratio(band, 4)} at this sample size. ${stats.significantLags} of ${params.maxLag} lags fall outside it — by chance alone you would expect about ${ratio(params.maxLag * 0.05, 1)}.`}
                    />
                    <SimpleBarChart
                      data={squaredAcf.map((v, i) => ({ lag: String(i + 1), acf: v }))}
                      xKey="lag"
                      bars={[{ key: "acf", label: "Autocorrelation of SQUARED returns", color: "var(--series-5)" }]}
                      title="Autocorrelation function of squared returns"
                      description="The same chart applied to squared returns, which proxy for variance. Persistent positive bars here mean volatility clusters even when returns themselves are unpredictable."
                      formatY={(v) => v.toFixed(3)}
                      height={240}
                      footnote="This is the chart that separates a random walk from a regime-switching market. The two can have identical return autocorrelation while differing completely here — and that is exactly the pattern real markets show."
                    />
                  </div>
                ) : null}
              </CardBody>
            </Card>

            <MetricGrid>
              <MetricCard
                label="Lag-1 autocorrelation"
                value={ratio(stats.lag1, 4)}
                tone={Math.abs(stats.lag1) > band ? (stats.lag1 > 0 ? "positive" : "negative") : "neutral"}
                footnote={Math.abs(stats.lag1) > band ? "Outside the noise band" : "Indistinguishable from zero"}
                hint="Positive means momentum, negative means mean reversion, near zero means no linear memory."
              />
              <MetricCard
                label="Lag-1 of squared returns"
                value={ratio(stats.lag1Squared, 4)}
                tone={stats.lag1Squared > band ? "caution" : "neutral"}
                hint="Measures volatility clustering. Real markets show a large positive value here alongside a near-zero value for returns themselves."
              />
              <MetricCard label="Realised drift" value={percent(stats.annualDrift, 2)} footnote={`Target ${percent(params.drift, 1)}`} />
              <MetricCard label="Realised volatility" value={percent(stats.annualVol, 2)} footnote={`Target ${percent(params.volatility, 0)}`} />
              <MetricCard label="Skewness" value={ratio(stats.skew, 3)} />
              <MetricCard
                label="Excess kurtosis"
                value={ratio(stats.excessKurtosis, 3)}
                tone={stats.excessKurtosis > 0.5 ? "caution" : "neutral"}
              />
              <MetricCard label="Observations" value={integer(series.returns.length)} />
              <MetricCard label="95% noise band" value={`±${ratio(band, 4)}`} hint="1.96/√n — the range within which a white-noise series' autocorrelation would fall 95% of the time." />
            </MetricGrid>
          </div>
        </div>
      </ExperimentSection>

      {/* ---------------- Model ---------------- */}
      <ExperimentSection kind="model">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="AR(1): the simplest process with memory" />
            <CardBody className="space-y-3">
              <EquationBlock
                equation={"r_t = c + \\varphi\\, r_{t-1} + \\varepsilon_t, \\qquad \\varepsilon_t \\sim N(0, \\sigma_\\varepsilon^2)"}
                description="Today's return is a fraction φ of yesterday's, plus fresh noise."
                where={[
                  { symbol: "\\varphi", meaning: "the memory parameter: > 0 is momentum, < 0 is mean reversion, = 0 is a random walk" },
                  { symbol: "\\varepsilon_t", meaning: "an independent shock, the only new information each period" },
                ]}
              />
              <EquationBlock
                label="Theoretical autocorrelation"
                equation={"\\operatorname{Corr}(r_t, r_{t-k}) = \\varphi^{\\,k}"}
                description="Memory decays geometrically with the lag. At φ = 0.3 the lag-2 correlation is already only 0.09."
              />
              <Callout tone="accent" title="Why we rescale the shocks">
                <p>
                  A stationary AR(1) has unconditional variance{" "}
                  <InlineMath>{"\\sigma_\\varepsilon^2 / (1 - \\varphi^2)"}</InlineMath>, which is larger than
                  the shock variance for any non-zero φ. If we fed the shocks in unscaled, raising φ would
                  quietly raise the series&rsquo; total volatility at the same time.
                </p>
                <p>
                  The generator therefore scales the innovations by{" "}
                  <InlineMath>{"\\sqrt{1 - \\varphi^2}"}</InlineMath> so that realised volatility stays at your
                  target no matter what φ is. That makes any comparison across φ a controlled one: only the
                  memory changes. Without it you would be varying two things at once and attributing the
                  result to the wrong one.
                </p>
              </Callout>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Stationarity, and why it matters" />
            <CardBody className="space-y-3">
              <p className="text-xs leading-relaxed text-ink-muted">
                A series is <strong className="text-ink">stationary</strong> if its statistical properties do
                not depend on when you look — the mean, variance and autocorrelation structure are the same in
                every window.
              </p>
              <p className="text-xs leading-relaxed text-ink-muted">
                AR(1) is stationary only when <InlineMath>{"|\\varphi| < 1"}</InlineMath>. At{" "}
                <InlineMath>{"|\\varphi| \\ge 1"}</InlineMath> shocks never decay, variance grows without
                bound, and there is no long-run mean to revert to — the generator rejects those values rather
                than silently producing a divergent series.
              </p>
              <p className="text-xs leading-relaxed text-ink-muted">
                This matters because almost every statistical tool assumes stationarity. Prices themselves are
                <em> not</em> stationary — they wander without a fixed mean — which is why finance works with
                returns rather than levels. Taking the difference of a non-stationary series to obtain a
                stationary one is the single most common transformation in time-series analysis.
              </p>
              <Callout tone="caution" title="Regime switching is not stationary in the usual sense">
                <p>
                  A regime-switching series is stationary only if you include the hidden state in the
                  description. Viewed through returns alone, its volatility genuinely changes over time — and
                  that is exactly what makes it a good model of markets and a bad fit for tools that assume
                  constant variance.
                </p>
              </Callout>
            </CardBody>
          </Card>
        </div>

        <ResearchOnly>
          <Card className="mt-4">
            <CardHeader title="Autocorrelation values" subtitle="Observed against theoretical, where a theoretical value exists." />
            <CardBody>
              <DataTable
                columns={["Lag", "ACF of returns", "Theoretical φᵏ", "ACF of squared returns", "Outside noise band?"]}
                align={["right", "right", "right", "right", "left"]}
                caption={`95% noise band is ±${ratio(band, 4)}. For AR(1) the theoretical ACF is φ raised to the lag; for regime switching there is no simple closed form.`}
                rows={acf.slice(0, 12).map((v, i) => {
                  const phi = params.mode === "momentum" ? params.phi : params.mode === "meanReversion" ? -params.phi : 0;
                  const theoretical = params.mode === "regimeSwitching" ? null : phi ** (i + 1);
                  return [
                    integer(i + 1),
                    ratio(v, 4),
                    theoretical === null ? "—" : ratio(theoretical, 4),
                    ratio(squaredAcf[i], 4),
                    <span key={i} className={Math.abs(v) > band ? "text-caution" : "text-ink-faint"}>
                      {Math.abs(v) > band ? "Yes" : "No"}
                    </span>,
                  ];
                })}
              />
            </CardBody>
          </Card>
        </ResearchOnly>
      </ExperimentSection>

      <ExperimentSection kind="interpretation">
        <FindingBlock
          observation={
            <>
              This {MODE_LABELS[params.mode]} series has lag-1 return autocorrelation{" "}
              <strong className="text-ink">{ratio(stats.lag1, 4)}</strong> and lag-1 squared-return
              autocorrelation <strong className="text-ink">{ratio(stats.lag1Squared, 4)}</strong>, against a
              95% noise band of ±{ratio(band, 4)}. Excess kurtosis is {ratio(stats.excessKurtosis, 2)}.
            </>
          }
          interpretation={
            params.mode === "regimeSwitching" ? (
              <>
                Regime switching produces almost no autocorrelation in returns — a trend-following rule would
                find nothing — while producing strong autocorrelation in squared returns and visible excess
                kurtosis. The predictability is in the <em>variance</em>, not the <em>mean</em>. This is the
                combination real markets display, and it is why volatility forecasting is a mature, successful
                field while return forecasting is not.
              </>
            ) : params.mode === "randomWalk" ? (
              <>
                Both autocorrelation functions are flat within the noise band, as they must be: this process
                has no memory of any kind. Note how many individual bars still poke outside the band — about 5%
                of them will, by construction, because the band is a 95% interval. Reading significance into
                those bars is multiple testing, and it is the same error the Overfitting Lab is about.
              </>
            ) : (
              <>
                The lag-1 autocorrelation of {ratio(stats.lag1, 4)} is close to the φ of{" "}
                {ratio(params.mode === "momentum" ? params.phi : -params.phi, 2)} that generated it, and the
                higher lags decay geometrically as φᵏ. This is what detectable linear structure looks like —
                and it is worth noticing how large φ has to be before the pattern is obvious, compared with the
                |φ| below 0.05 that real daily equity returns exhibit.
              </>
            )
          }
          conclusion={
            <>
              A price chart cannot distinguish these processes; an autocorrelation function can. And the
              return ACF and the squared-return ACF answer genuinely different questions — a series can be
              unpredictable in one sense and highly structured in the other.
            </>
          }
          limitation={
            <>
              Autocorrelation detects only <em>linear</em> dependence. A series can be completely
              deterministic and still show zero autocorrelation at every lag. Absence of autocorrelation is
              therefore evidence against linear predictability, not evidence of randomness — a distinction
              that matters a great deal before concluding that a market is efficient.
            </>
          }
        />
      </ExperimentSection>

      <ExperimentSection kind="limitations">
        <Callout tone="caution" title="One sample, and a test you will run many times">
          <p>
            Every statistic here is estimated from a single path of {integer(series.returns.length)}{" "}
            observations. The standard error on an autocorrelation estimate is roughly{" "}
            <InlineMath>{"1/\\sqrt{n}"}</InlineMath> = {ratio(1 / Math.sqrt(series.returns.length), 4)}, which
            means detecting a true φ of 0.03 reliably would need tens of thousands of observations — more daily
            data than most markets have produced in their entire history.
          </p>
          <p>
            That is the fundamental difficulty: the structures that would be profitable are small enough to be
            nearly undetectable, and the structures large enough to detect easily do not survive in real
            markets because somebody would have traded them away. Change the seed a few times to see how much
            the ACF bars move when nothing about the process has changed at all.
          </p>
        </Callout>
      </ExperimentSection>

      <ReproducibilityPanel
        title="Random Walk vs Market Structure"
        prefix="RW"
        config={config}
        labels={RANDOM_WALK_LABELS}
        basePath="/labs/random-walk"
        exports={[
          {
            label: "Export series (CSV)",
            filename: `quantlab-randomwalk-${params.mode}-${params.seed}.csv`,
            mime: "text/csv",
            build: () =>
              toCSV(
                series.returns.map((r, i) => ({
                  day: i,
                  price: series.prices[i + 1].toFixed(6),
                  return: r.toFixed(8),
                  rolling_volatility: rollingVol[i] === null ? "" : rollingVol[i]!.toFixed(6),
                  hidden_state: series.regimes ? REGIME_NAMES[series.regimes[i]] : "",
                })),
              ),
          },
          {
            label: "Export diagnostics (JSON)",
            filename: `quantlab-randomwalk-${params.mode}-${params.seed}.json`,
            mime: "application/json",
            build: () =>
              JSON.stringify(
                {
                  experiment: "Random Walk vs Market Structure",
                  process: MODE_LABELS[params.mode],
                  parameters: config,
                  statistics: stats,
                  noise_band_95: band,
                  acf_returns: acf,
                  acf_squared_returns: squaredAcf,
                  note: "Synthetic data with a known data-generating process.",
                },
                null,
                2,
              ),
          },
        ]}
      />
    </LabShell>
  );
}
