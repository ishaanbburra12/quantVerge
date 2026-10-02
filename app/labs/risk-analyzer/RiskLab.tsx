"use client";

import { useMemo, useState } from "react";
import {
  Button, Callout, Card, CardBody, CardHeader, MetricCard, MetricGrid,
  SliderControl, NumberField, SelectField, DataTable, Badge,
} from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";
import { ExperimentSection, FindingBlock, ResearchOnly } from "@/components/labs/ExperimentSection";
import { LabShell, ReproducibilityPanel } from "@/components/labs/LabShell";
import { EquityChart, HistogramChart, MultiLineChart, SimpleBarChart } from "@/components/charts";
import { generateRiskSeries } from "@/lib/simulation/riskProcesses";
import {
  annualisedReturn, annualisedVolatility, sharpeRatio, sortinoRatio, downsideDeviation,
  maxDrawdown, valueAtRisk, conditionalVaR, parametricVaR, calmarRatio, hitRate, profitFactor,
} from "@/lib/finance/performance";
import { normalInverseCDF, histogram, normalPDF } from "@/lib/math/distributions";
import { mean, standardDeviation, skewness, kurtosis, percentile } from "@/lib/statistics/descriptive";
import { mulberry32, normalSampler } from "@/lib/math/random";
import { toCSV } from "@/lib/experiment/config";
import { percent, ratio, integer, currency } from "@/lib/format";
import type { LabMeta } from "@/content/labs";
import {
  RISK_DEFAULTS, RISK_LABELS, PROCESS_LABELS, PROCESS_DESCRIPTIONS,
  type RiskParams, type ReturnProcess,
} from "@/lib/labs/risk";

const CONFIDENCE_LEVELS = [0.9, 0.95, 0.99] as const;

export function RiskLab({ lab, initialParams }: { lab: LabMeta; initialParams: RiskParams }) {
  const [params, setParams] = useState<RiskParams>(initialParams);

  const update = <K extends keyof RiskParams>(key: K, value: RiskParams[K]) =>
    setParams((previous) => ({ ...previous, [key]: value }));

  const series = useMemo(
    () =>
      generateRiskSeries(params.process, {
        drift: params.drift,
        volatility: params.volatility,
        steps: params.steps,
        seed: params.seed,
        tailParam: params.tailParam,
      }),
    [params.process, params.drift, params.volatility, params.steps, params.seed, params.tailParam],
  );

  const rets = series.returns;
  const drawdown = useMemo(() => maxDrawdown(series.prices), [series.prices]);

  const metrics = useMemo(
    () => ({
      annualReturn: annualisedReturn(rets, 252),
      volatility: annualisedVolatility(rets, 252),
      downside: downsideDeviation(rets, params.riskFreeRate, 252),
      sharpe: sharpeRatio(rets, params.riskFreeRate, 252),
      sortino: sortinoRatio(rets, params.riskFreeRate, 252),
      calmar: calmarRatio(rets, 252),
      hitRate: hitRate(rets),
      profitFactor: profitFactor(rets),
      skew: skewness(rets),
      excessKurtosis: kurtosis(rets),
      worstDay: Math.min(...rets),
      bestDay: Math.max(...rets),
    }),
    [rets, params.riskFreeRate],
  );

  /**
   * Monte Carlo VaR.
   *
   * Rather than resampling the observed returns (which would be a bootstrap,
   * i.e. historical VaR with extra steps), we FIT a normal distribution to the
   * data and simulate from it. That makes this a genuinely distinct third
   * method: it shares the parametric method's distributional assumption but
   * estimates the quantile by simulation rather than by formula.
   *
   * Comparing the three therefore separates two different sources of
   * disagreement: parametric vs Monte Carlo differ only by simulation error,
   * while both differ from historical by model error.
   */
  const monteCarloVaR = useMemo(() => {
    const mu = mean(rets);
    const sd = standardDeviation(rets, 1);
    const normal = normalSampler(mulberry32(params.seed + 7919));
    const draws = new Array<number>(params.monteCarloRuns);
    for (let i = 0; i < params.monteCarloRuns; i++) draws[i] = mu + sd * normal();
    return CONFIDENCE_LEVELS.map((c) => ({
      confidence: c,
      var: valueAtRisk(draws, c),
      cvar: conditionalVaR(draws, c),
    }));
  }, [rets, params.monteCarloRuns, params.seed]);

  const varComparison = useMemo(
    () =>
      CONFIDENCE_LEVELS.map((c, i) => ({
        confidence: c,
        historical: valueAtRisk(rets, c),
        parametric: parametricVaR(rets, c, normalInverseCDF),
        monteCarlo: monteCarloVaR[i].var,
        historicalCVaR: conditionalVaR(rets, c),
        parametricCVaR: parametricCVaRFor(rets, c),
      })),
    [rets, monteCarloVaR],
  );

  const activeVaR = useMemo(() => {
    const c = params.confidence;
    return {
      historical: valueAtRisk(rets, c),
      parametric: parametricVaR(rets, c, normalInverseCDF),
      cvar: conditionalVaR(rets, c),
    };
  }, [rets, params.confidence]);

  const returnHistogram = useMemo(() => histogram(rets, 60), [rets]);

  /** Fitted normal density, to show visually where the Gaussian assumption fails. */
  const normalOverlay = useMemo(() => {
    if (returnHistogram.length === 0) return undefined;
    const mu = mean(rets);
    const sd = standardDeviation(rets, 1);
    const lo = returnHistogram[0].binStart;
    const hi = returnHistogram[returnHistogram.length - 1].binEnd;
    const curve: { x: number; y: number }[] = [];
    const stepSize = (hi - lo) / 240;
    for (let x = lo; x <= hi; x += stepSize) curve.push({ x, y: normalPDF(x, mu, sd) });
    return curve;
  }, [rets, returnHistogram]);

  /**
   * How often did losses actually exceed the VaR estimate?
   *
   * This is a VaR BACKTEST, and it is the only way to check whether a risk model
   * is calibrated. A 95% VaR should be breached on about 5% of days. Materially
   * more means the model understates risk; materially fewer means it overstates
   * it and is wasting capital.
   */
  const breaches = useMemo(
    () =>
      CONFIDENCE_LEVELS.map((c) => {
        const threshold = -parametricVaR(rets, c, normalInverseCDF);
        const count = rets.filter((r) => r < threshold).length;
        return {
          confidence: c,
          expected: 1 - c,
          observed: count / rets.length,
          count,
          expectedCount: (1 - c) * rets.length,
        };
      }),
    [rets],
  );

  const config: Record<string, number | string> = { ...params };

  return (
    <LabShell
      lab={lab}
      question="Six different numbers all claim to measure the risk of the same return series. When do they agree, when do they disagree, and what does each one fail to see?"
    >
      <ExperimentSection kind="inputs">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Return process" subtitle="All four are calibrated to the same annual volatility, so only the shape of the distribution differs." />
            <CardBody className="space-y-4">
              <SelectField
                label="Process"
                value={params.process}
                options={(Object.keys(PROCESS_LABELS) as ReturnProcess[]).map((p) => ({
                  value: p,
                  label: PROCESS_LABELS[p],
                }))}
                onChange={(v) => update("process", v)}
              />
              <p className="rounded-card border border-line bg-surface-sunken px-3 py-2 text-2xs leading-relaxed text-ink-muted">
                {PROCESS_DESCRIPTIONS[params.process]}
              </p>

              {params.process !== "gbm" ? (
                <SliderControl
                  label="Tail intensity"
                  value={params.tailParam}
                  min={0} max={1} step={0.05}
                  onChange={(v) => update("tailParam", v)}
                  format={(v) => v.toFixed(2)}
                  hint="Controls how heavy the tails are, with total volatility held fixed. At 0 the process is essentially Gaussian; at 1 the tails are severe."
                />
              ) : null}

              <SliderControl
                label="Annual drift"
                value={params.drift}
                min={-0.3} max={0.3} step={0.005}
                onChange={(v) => update("drift", v)}
                format={(v) => percent(v, 1)}
              />
              <SliderControl
                label="Annual volatility"
                value={params.volatility}
                min={0.05} max={0.6} step={0.01}
                onChange={(v) => update("volatility", v)}
                format={(v) => percent(v, 0)}
              />
              <SliderControl
                label="Trading days"
                value={params.steps}
                min={252} max={5040} step={252}
                onChange={(v) => update("steps", v)}
                format={(v) => `${integer(v)} (${(v / 252).toFixed(0)}y)`}
                hint="Longer samples estimate tail quantiles more reliably. A 99% VaR from one year of data rests on only about 2.5 observations."
              />
              <SliderControl
                label="VaR confidence"
                value={params.confidence}
                min={0.8} max={0.995} step={0.005}
                onChange={(v) => update("confidence", v)}
                format={(v) => percent(v, 1)}
              />
              <SliderControl
                label="Risk-free rate"
                value={params.riskFreeRate}
                min={0} max={0.1} step={0.0025}
                onChange={(v) => update("riskFreeRate", v)}
                format={(v) => percent(v, 2)}
              />
              <NumberField
                label="Random seed"
                value={params.seed}
                onChange={(v) => update("seed", Math.max(0, Math.floor(v)))}
                min={0} step={1}
              />
              <div className="flex gap-2 border-t border-line pt-3">
                <Button size="sm" onClick={() => update("seed", Math.floor(Math.random() * 1_000_000))}>
                  New seed
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setParams(RISK_DEFAULTS)}>
                  Reset
                </Button>
              </div>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Equity curve and maximum drawdown"
                subtitle="The peak and trough responsible for the worst decline are marked."
              />
              <CardBody>
                <EquityChart
                  series={[{ key: "equity", label: "Portfolio value", values: series.prices, color: "var(--series-1)" }]}
                  title="Equity curve"
                  description={`Portfolio value over ${(params.steps / 252).toFixed(0)} years. A green marker shows the peak preceding the worst drawdown, and a red marker shows the trough.`}
                  peakIndex={drawdown.peakIndex}
                  troughIndex={drawdown.troughIndex}
                  peakValue={series.prices[drawdown.peakIndex]}
                  troughValue={series.prices[drawdown.troughIndex]}
                  formatY={(v) => `$${v.toFixed(0)}`}
                  height={290}
                  footnote={`Worst drawdown ${percent(drawdown.maxDrawdown, 2)}: from ${currency(series.prices[drawdown.peakIndex])} on day ${integer(drawdown.peakIndex)} to ${currency(series.prices[drawdown.troughIndex])} on day ${integer(drawdown.troughIndex)}${drawdown.recoveryIndex !== null ? `, recovered on day ${integer(drawdown.recoveryIndex)}` : ", never recovered within the sample"}.`}
                />
              </CardBody>
            </Card>

            <MetricGrid>
              <MetricCard
                label="Annualised return"
                value={percent(metrics.annualReturn, 2)}
                tone={metrics.annualReturn > 0 ? "positive" : "negative"}
                hint="Geometric (CAGR), not arithmetic. Always below the arithmetic mean when returns vary."
              />
              <MetricCard
                label="Volatility"
                value={percent(metrics.volatility, 2)}
                hint="Annualised standard deviation. Penalises upside and downside identically."
              />
              <MetricCard
                label="Downside deviation"
                value={percent(metrics.downside, 2)}
                hint="Like volatility, but only counts returns below the target. Divides by the full sample size, not by the number of losses."
              />
              <MetricCard
                label="Max drawdown"
                value={percent(drawdown.maxDrawdown, 2)}
                tone="negative"
                hint="The worst peak-to-trough fall. Path-dependent: reordering the same returns changes it."
              />
              <MetricCard
                label="Sharpe ratio"
                value={ratio(metrics.sharpe, 3)}
                tone={metrics.sharpe > 0.5 ? "positive" : metrics.sharpe > 0 ? "neutral" : "negative"}
              />
              <MetricCard
                label="Sortino ratio"
                value={ratio(metrics.sortino, 3)}
                tone={metrics.sortino > metrics.sharpe ? "positive" : "neutral"}
                hint="Sharpe, but dividing by downside deviation only. Exceeds Sharpe when returns are positively skewed."
              />
              <MetricCard
                label="Calmar ratio"
                value={ratio(metrics.calmar, 3)}
                hint="Annualised return divided by maximum drawdown. Sensitive to a single bad episode."
              />
              <MetricCard
                label={`VaR ${percent(params.confidence, 1)}`}
                value={percent(activeVaR.historical, 2)}
                tone="negative"
                hint="Historical VaR: the daily loss exceeded only (1 − confidence) of the time. NOT the worst case."
              />
            </MetricGrid>
          </div>
        </div>
      </ExperimentSection>

      {/* ---------------- Model / formulas ---------------- */}
      <ExperimentSection kind="model" title="The formulas">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="Volatility-based" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="Sharpe ratio"
                equation={"S = \\frac{E[R_p] - r_f}{\\sigma_p}"}
                description="Excess return per unit of total volatility."
              />
              <EquationBlock
                label="Downside deviation"
                equation={"DD = \\sqrt{\\frac{1}{n}\\sum_{t=1}^{n}\\min(r_t - \\tau, 0)^2}"}
                description="Note the divisor: we sum only the shortfalls but divide by the FULL count n. Dividing by the number of losses instead is a common implementation bug, and it would make a strategy with few large losses look identical to one with many."
                where={[{ symbol: "\\tau", meaning: "the minimum acceptable return, here the risk-free rate" }]}
              />
              <EquationBlock
                label="Sortino ratio"
                equation={"\\text{Sortino} = \\frac{E[R_p] - r_f}{DD}"}
                description="Stops punishing a strategy for having big winning days."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Path-dependent" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="Drawdown at time t"
                equation={"D_t = \\frac{V_t - \\max_{s \\le t} V_s}{\\max_{s \\le t} V_s}"}
                description="Distance below the running high-water mark. The maximum drawdown is the most negative of these."
              />
              <Callout tone="accent" title="Why drawdown is different">
                <p>
                  Volatility is a property of the <em>set</em> of returns — shuffle them and it does not
                  change. Drawdown depends on their <em>order</em>. Three bad months in a row produce a far
                  worse drawdown than the same three months scattered across a decade, even though every other
                  statistic is identical.
                </p>
                <p>
                  That is why drawdown captures something real that volatility misses: the lived experience of
                  being underwater, and the point at which someone abandons a strategy.
                </p>
              </Callout>
              <EquationBlock
                label="Calmar ratio"
                equation={"\\text{Calmar} = \\frac{\\text{CAGR}}{\\text{Max drawdown}}"}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tail-based" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="Value at Risk"
                equation={"\\text{VaR}_c = -\\inf\\{x : P(R \\le x) > 1 - c\\}"}
                description="The loss threshold exceeded only (1 − c) of the time. At 95%, the 5th percentile of the return distribution."
              />
              <EquationBlock
                label="Parametric VaR"
                equation={"\\text{VaR}_c = -\\left(\\mu + z_{1-c}\\,\\sigma\\right)"}
                description="Assumes normality, so it needs only the mean and standard deviation."
                where={[{ symbol: "z_{1-c}", meaning: "the normal quantile at the tail probability — −1.645 at 95%, −2.326 at 99%" }]}
              />
              <EquationBlock
                label="Conditional VaR"
                equation={"\\text{CVaR}_c = -E\\!\\left[R \\mid R \\le -\\text{VaR}_c\\right]"}
                description="The AVERAGE loss given that you are already in the worst (1 − c) of cases."
              />
            </CardBody>
          </Card>
        </div>

        <Callout tone="caution" title="VaR is not the worst possible loss — read this twice">
          <p>
            A 95% one-day VaR of {percent(activeVaR.historical, 2)} says: <em>on about one day in twenty, I
            lose more than {percent(activeVaR.historical, 2)}</em>. It says absolutely nothing about how much
            more. The entire tail beyond the threshold is invisible to it.
          </p>
          <p>
            Two portfolios can have identical VaR while one risks a slightly worse day and the other risks
            total ruin. In this sample, the average loss <em>given</em> that the threshold was breached — the
            CVaR — is {percent(activeVaR.cvar, 2)}, which is{" "}
            <strong className="text-ink">
              {ratio(activeVaR.cvar / Math.max(1e-9, activeVaR.historical), 2)}×
            </strong>{" "}
            the VaR figure.
          </p>
          <p>
            VaR also fails a basic coherence property: it is not subadditive, so combining two portfolios can
            make VaR appear to <em>rise</em>, implying that diversification increased risk. CVaR is coherent
            and never does this, which is why regulators have moved toward expected shortfall.
          </p>
        </Callout>
      </ExperimentSection>

      {/* ---------------- Results ---------------- */}
      <ExperimentSection kind="results" title="Three ways to estimate the same number">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Historical vs parametric vs Monte Carlo VaR"
              subtitle="All three estimate the same quantity from the same data. Where they disagree, the disagreement is informative."
            />
            <CardBody className="space-y-4">
              <DataTable
                columns={["Confidence", "Historical VaR", "Parametric VaR", "Monte Carlo VaR", "Historical CVaR", "Parametric gap"]}
                align={["left", "right", "right", "right", "right", "right"]}
                caption="Daily loss figures, as positive percentages. The parametric gap is how much the Gaussian formula understates (negative) or overstates (positive) the historical estimate."
                rows={varComparison.map((row) => [
                  percent(row.confidence, 1),
                  percent(row.historical, 3),
                  percent(row.parametric, 3),
                  percent(row.monteCarlo, 3),
                  percent(row.historicalCVaR, 3),
                  <span
                    key={row.confidence}
                    className={row.parametric < row.historical ? "text-negative" : "text-ink-muted"}
                  >
                    {percent(row.parametric - row.historical, 3)}
                  </span>,
                ])}
              />

              <SimpleBarChart
                data={varComparison.map((row) => ({
                  level: percent(row.confidence, 0),
                  historical: row.historical,
                  parametric: row.parametric,
                  monteCarlo: row.monteCarlo,
                  cvar: row.historicalCVaR,
                }))}
                xKey="level"
                bars={[
                  { key: "historical", label: "Historical VaR", color: "var(--series-1)" },
                  { key: "parametric", label: "Parametric VaR", color: "var(--series-2)" },
                  { key: "monteCarlo", label: "Monte Carlo VaR", color: "var(--series-3)" },
                  { key: "cvar", label: "Historical CVaR", color: "var(--series-5)" },
                ]}
                title="VaR estimates by method and confidence level"
                description="Grouped bars comparing the three VaR methods and CVaR at 90%, 95% and 99% confidence. CVaR is always the tallest bar; the parametric estimate falls short of the historical one when the data has fat tails."
                formatY={(v) => percent(v, 1)}
                height={250}
                footnote="Parametric and Monte Carlo share the same normality assumption, so they differ only by simulation error. Either one differing from historical indicates model error — the data is not Gaussian."
              />

              <FindingBlock
                observation={
                  <>
                    At {percent(params.confidence, 1)} confidence on this{" "}
                    {PROCESS_LABELS[params.process].toLowerCase()} series, historical VaR is{" "}
                    {percent(activeVaR.historical, 3)} and parametric VaR is{" "}
                    {percent(activeVaR.parametric, 3)}, a difference of{" "}
                    <strong className="text-ink">{percent(activeVaR.parametric - activeVaR.historical, 3)}</strong>.
                    The sample has excess kurtosis {ratio(metrics.excessKurtosis, 2)} and skewness{" "}
                    {ratio(metrics.skew, 2)}.
                  </>
                }
                interpretation={
                  params.process === "gbm" ? (
                    <>
                      With Gaussian returns the normality assumption is exactly correct, so the three methods
                      should and do agree closely. What remains is sampling error: with {integer(params.steps)}{" "}
                      observations, the {percent(params.confidence, 1)} quantile is estimated from only about{" "}
                      {integer((1 - params.confidence) * params.steps)} tail points, so the historical estimate
                      is the noisiest of the three. This is the control condition — switch the process to see
                      model error appear.
                    </>
                  ) : (
                    <>
                      <p>
                        Excess kurtosis of {ratio(metrics.excessKurtosis, 2)} means this distribution is not
                        normal, and the parametric method — which sees only a mean and a standard deviation —
                        cannot represent its shape at all. At {percent(params.confidence, 1)} it{" "}
                        {activeVaR.parametric < activeVaR.historical ? "understates" : "overstates"} the
                        historical quantile by {percent(Math.abs(activeVaR.parametric - activeVaR.historical), 3)}.
                      </p>
                      <p className="mt-2">
                        Look along the confidence column rather than at one row, because the error typically{" "}
                        <strong className="text-ink">changes sign</strong> rather than simply growing. A
                        leptokurtic distribution is more peaked in the middle, <em>thinner</em> through the
                        shoulders, and fatter only in the extreme tail. So at 90% the Gaussian fit sits further
                        out than the data and overstates risk; by 99% the data has overtaken it and it
                        understates. The crossover point is a property of the distribution&rsquo;s shape, and it
                        is the reason a risk model validated at 95% can still fail badly at 99.9%.
                      </p>
                      <p className="mt-2">
                        The clearest symptom is the CVaR-to-VaR ratio, currently{" "}
                        {ratio(activeVaR.cvar / Math.max(1e-9, activeVaR.historical), 2)}×. For a normal
                        distribution at this confidence level it would be about{" "}
                        {ratio(
                          parametricCVaRFor(rets, params.confidence) /
                            Math.max(1e-9, parametricVaR(rets, params.confidence, normalInverseCDF)),
                          2,
                        )}
                        ×. When losses do breach the threshold on fat-tailed data, they breach it by much more.
                      </p>
                    </>
                  )
                }
                conclusion={
                  <>
                    Agreement between the three methods is evidence that the data is approximately Gaussian, not
                    evidence that the risk estimate is correct. Disagreement is the more useful signal: it
                    locates exactly where the normality assumption is doing damage.
                  </>
                }
                limitation={
                  <>
                    All three methods are estimated on the same single sample of {integer(params.steps)} days.
                    None of them can see a loss larger than anything that has happened, and the historical
                    method in particular is bounded below by the worst observation in the sample —{" "}
                    {percent(metrics.worstDay, 2)}. Changing the seed will change these numbers; if a
                    conclusion does not survive that, it was noise.
                  </>
                }
              />
            </CardBody>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Return distribution against a fitted normal"
                subtitle="Where the bars exceed the curve in the tails, the Gaussian model is understating risk."
              />
              <CardBody>
                <HistogramChart
                  bins={returnHistogram}
                  overlay={normalOverlay}
                  title="Daily return distribution"
                  description="Histogram of daily returns with a fitted normal density overlaid. For heavy-tailed processes the histogram has a taller peak and fatter tails than the curve, with less weight in the shoulders."
                  xLabel="Daily return"
                  formatX={(v) => percent(v, 1)}
                  markers={[
                    { value: -activeVaR.historical, label: `VaR ${percent(params.confidence, 0)}`, color: "var(--series-2)" },
                    { value: -activeVaR.cvar, label: `CVaR ${percent(params.confidence, 0)}`, color: "var(--series-5)" },
                  ]}
                  height={280}
                  footnote="The two dashed lines show where VaR cuts the distribution and where the average of everything beyond it sits. The gap between them is precisely the information VaR discards."
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="VaR backtest: how often was the threshold breached?"
                subtitle="The only real test of a risk model. A 95% VaR should be exceeded on about 5% of days."
              />
              <CardBody className="space-y-3">
                <DataTable
                  columns={["Confidence", "Expected breaches", "Observed breaches", "Expected rate", "Observed rate", "Verdict"]}
                  align={["left", "right", "right", "right", "right", "left"]}
                  caption="Breaches of the parametric (Gaussian) VaR threshold. Systematic over-breaching means the model understates risk."
                  rows={breaches.map((row) => {
                    const excess = row.observed / Math.max(1e-9, row.expected);
                    return [
                      percent(row.confidence, 1),
                      ratio(row.expectedCount, 0),
                      integer(row.count),
                      percent(row.expected, 2),
                      percent(row.observed, 2),
                      <span
                        key={row.confidence}
                        className={excess > 1.4 ? "text-negative" : excess < 0.6 ? "text-caution" : "text-positive"}
                      >
                        {excess > 1.4 ? "Understates risk" : excess < 0.6 ? "Overstates risk" : "Well calibrated"}
                      </span>,
                    ];
                  })}
                />
                <p className="text-2xs leading-relaxed text-ink-faint">
                  Breach counts are themselves random. Under a correct model the count is Binomial, with
                  standard deviation <InlineMath>{"\\sqrt{n p (1-p)}"}</InlineMath> — about{" "}
                  {ratio(Math.sqrt(params.steps * 0.05 * 0.95), 1)} breaches at the 95% level over{" "}
                  {integer(params.steps)} days. A verdict here is suggestive, not conclusive; formal tests
                  (Kupiec, Christoffersen) exist precisely because eyeballing the count is unreliable.
                </p>
              </CardBody>
            </Card>
          </div>

          <ResearchOnly>
            <Card>
              <CardHeader title="Full statistics" subtitle={series.tailMechanism} />
              <CardBody>
                <DataTable
                  columns={["Statistic", "Value"]}
                  align={["left", "right"]}
                  rows={[
                    ["Observations", integer(rets.length)],
                    ["Annualised return (CAGR)", percent(metrics.annualReturn, 3)],
                    ["Arithmetic mean (annualised)", percent(mean(rets) * 252, 3)],
                    ["Annualised volatility", percent(metrics.volatility, 3)],
                    ["Downside deviation", percent(metrics.downside, 3)],
                    ["Skewness", ratio(metrics.skew, 4)],
                    ["Excess kurtosis", ratio(metrics.excessKurtosis, 4)],
                    ["Best day / worst day", `${percent(metrics.bestDay, 2)} / ${percent(metrics.worstDay, 2)}`],
                    ["Hit rate", percent(metrics.hitRate, 2)],
                    ["Profit factor", Number.isFinite(metrics.profitFactor) ? ratio(metrics.profitFactor, 3) : "∞"],
                    ["Sharpe / Sortino / Calmar", `${ratio(metrics.sharpe, 3)} / ${ratio(metrics.sortino, 3)} / ${ratio(metrics.calmar, 3)}`],
                    ["Max drawdown", percent(drawdown.maxDrawdown, 3)],
                    ["Longest time below a prior peak", `${integer(drawdown.longestDrawdownLength)} days`],
                    ["1st / 5th percentile daily return", `${percent(percentile(rets, 1), 3)} / ${percent(percentile(rets, 5), 3)}`],
                  ]}
                />
              </CardBody>
            </Card>
          </ResearchOnly>
        </div>
      </ExperimentSection>

      {/* ---------------- Interpretation ---------------- */}
      <ExperimentSection kind="interpretation">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="What each metric cannot see" />
            <CardBody>
              <dl className="space-y-3 text-xs leading-relaxed">
                {[
                  { term: "Volatility", blind: "Direction and shape. It treats a 10% gain and a 10% loss identically, and it is finite even for distributions whose tails are catastrophic." },
                  { term: "Sharpe ratio", blind: "Everything beyond the first two moments. A strategy that sells insurance — small steady gains, rare enormous losses — can post an excellent Sharpe right up until it does not." },
                  { term: "Sortino ratio", blind: "The same tail problem as Sharpe. It fixes the asymmetry complaint but still summarises the downside with a single squared average." },
                  { term: "Maximum drawdown", blind: "Everything except one episode. It is determined by two days out of thousands, which makes it extremely noisy — and it can only get worse as the sample lengthens, so comparing it across different sample lengths is meaningless." },
                  { term: "Value at Risk", blind: "The entire tail beyond its own threshold, by construction. It also fails subadditivity, so it can reward concentration." },
                  { term: "Conditional VaR", blind: "Less than the others, but it is still an average of the tail, estimated from very few observations. At 99% on one year of data, it averages roughly two or three points." },
                ].map((item) => (
                  <div key={item.term} className="grid gap-0.5 sm:grid-cols-[130px_1fr] sm:gap-3">
                    <dt className="text-xs font-semibold text-ink">{item.term}</dt>
                    <dd className="text-ink-muted">{item.blind}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Experiments worth running" />
            <CardBody>
              <ol className="space-y-2.5 text-xs leading-relaxed text-ink-muted">
                {[
                  "Start on the Gaussian process and confirm all three VaR methods agree. That is your control. Then switch to Student-t at tail intensity 1 and watch the parametric estimate fall behind.",
                  "Compare the Sharpe ratio across all four processes. It barely moves, because all four have the same volatility by construction — yet their tail risk is wildly different. This is the clearest demonstration that Sharpe is blind to tails.",
                  "Push confidence to 99.5% with only 252 days. The historical estimate is now computed from roughly one observation. Change the seed a few times and watch it swing.",
                  "Compare maximum drawdown at 252 days versus 5040 days on the same process. It grows with sample length even though the process is unchanged — which is why drawdown comparisons across different periods are not valid.",
                  "On the jump process, find a seed where no large jump occurs. Every risk metric will look benign, and every one of them will be wrong about the process that generated it.",
                ].map((text, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="tabular shrink-0 text-accent">{String(i + 1).padStart(2, "0")}</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </ExperimentSection>

      <ExperimentSection kind="limitations">
        <Callout tone="caution" title="Every number here is an estimate from one sample">
          <p>
            Each metric on this page is a statistic computed from a single simulated history. None is a
            property of the process; all are noisy estimates of properties of the process. Tail metrics are the
            noisiest, because they are determined by the fewest observations — which is an unfortunate
            combination, since those are exactly the metrics people rely on when deciding how much can go
            wrong.
          </p>
          <p>
            The deeper issue is that risk measurement is backward-looking by construction. Every method here
            answers &ldquo;how bad were things?&rdquo; and is then used to answer &ldquo;how bad could things
            get?&rdquo; Those are different questions, and no amount of statistical sophistication converts one
            into the other. A model calibrated on a calm decade will report low risk right up to the moment the
            regime changes.
          </p>
          <p>
            This lab uses synthetic data with known properties. That is a feature — it lets you check whether a
            metric detects a tail risk that you <em>know</em> is there. On real data you never have that
            luxury.
          </p>
        </Callout>
      </ExperimentSection>

      <ReproducibilityPanel
        title="Risk Analyzer"
        prefix="RISK"
        config={config}
        labels={RISK_LABELS}
        basePath="/labs/risk-analyzer"
        exports={[
          {
            label: "Export returns (CSV)",
            filename: `quantlab-risk-${params.process}-${params.seed}.csv`,
            mime: "text/csv",
            build: () =>
              toCSV(
                rets.map((r, i) => ({
                  day: i,
                  price: series.prices[i + 1].toFixed(6),
                  return: r.toFixed(8),
                  drawdown: drawdown.series[i + 1]?.toFixed(8) ?? "",
                })),
              ),
          },
          {
            label: "Export metrics (JSON)",
            filename: `quantlab-risk-${params.process}-${params.seed}.json`,
            mime: "application/json",
            build: () =>
              JSON.stringify(
                {
                  experiment: "Risk Analyzer",
                  process: PROCESS_LABELS[params.process],
                  tail_mechanism: series.tailMechanism,
                  parameters: config,
                  metrics: { ...metrics, maxDrawdown: drawdown.maxDrawdown },
                  var_comparison: varComparison,
                  var_backtest: breaches,
                  note: "Synthetic data. All metrics are sample estimates from one simulated history.",
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

/**
 * Parametric CVaR under normality has a closed form:
 *
 *   CVaR_c = -(mu - sigma * phi(z_{1-c}) / (1 - c))
 *
 * where phi is the standard normal density. It is the mean of a truncated
 * normal below the quantile. Including it lets the table show that even the
 * Gaussian model knows CVaR exceeds VaR — the gap is not a tail phenomenon, it
 * is a property of averaging versus thresholding.
 */
function parametricCVaRFor(rets: number[], confidence: number): number {
  if (rets.length < 2) return 0;
  const mu = mean(rets);
  const sd = standardDeviation(rets, 1);
  const z = normalInverseCDF(1 - confidence);
  const density = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
  return Math.max(0, -(mu - (sd * density) / (1 - confidence)));
}
