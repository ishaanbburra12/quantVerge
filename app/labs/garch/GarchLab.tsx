"use client";

import { useMemo, useState } from "react";
import {
  Button, Callout, Card, CardBody, CardHeader, MetricCard, MetricGrid,
  SliderControl, NumberField, DataTable,
} from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";
import { ExperimentSection, FindingBlock, ResearchOnly } from "@/components/labs/ExperimentSection";
import { LabShell, ReproducibilityPanel } from "@/components/labs/LabShell";
import { MultiLineChart, SimpleBarChart, EquityChart } from "@/components/charts";
import { useDebounced } from "@/lib/hooks/useBatchedSimulation";
import {
  simulateGarch, fitGarch, garchFilter, forecastVariance, longRunVariance,
  volatilityHalfLife, garchLogLikelihood,
} from "@/lib/finance/garch";
import { autocorrelationFunction, autocorrelationConfidenceBand, kurtosis, standardDeviation } from "@/lib/statistics/descriptive";
import { toCSV } from "@/lib/experiment/config";
import { percent, ratio, integer, number as fmtNumber } from "@/lib/format";
import type { LabMeta } from "@/content/labs";
import { GARCH_DEFAULTS, GARCH_LABELS, type GarchLabParams } from "@/lib/labs/garch";

export function GarchLab({ lab, initialParams }: { lab: LabMeta; initialParams: GarchLabParams }) {
  const [liveParams, setParams] = useState<GarchLabParams>(initialParams);
  const params = useDebounced(liveParams, 200);

  const update = <K extends keyof GarchLabParams>(key: K, value: GarchLabParams[K]) =>
    setParams((previous) => ({ ...previous, [key]: value }));

  const trueParams = useMemo(
    () => ({ omega: params.omega, alpha: params.alpha, beta: params.beta, mu: params.mu }),
    [params],
  );

  const persistence = params.alpha + params.beta;
  const stationary = persistence < 1;

  const series = useMemo(
    () => (stationary ? simulateGarch(trueParams, params.steps, params.seed) : null),
    [trueParams, params.steps, params.seed, stationary],
  );

  /** Fit the model back to its own output — the recovery test. */
  const fit = useMemo(() => {
    if (!series) return null;
    try {
      return fitGarch(series.returns);
    } catch {
      return null;
    }
  }, [series]);

  const fittedPath = useMemo(
    () => (series && fit ? garchFilter(series.returns, fit.params) : null),
    [series, fit],
  );

  const forecast = useMemo(() => {
    if (!series) return [];
    const current = longRunVariance(trueParams) * params.shockMultiple;
    return forecastVariance(trueParams, current, params.forecastHorizon);
  }, [series, trueParams, params.shockMultiple, params.forecastHorizon]);

  const diagnostics = useMemo(() => {
    if (!series) return null;
    const squared = series.returns.map((r) => (r - params.mu) ** 2);
    return {
      acfReturns: autocorrelationFunction(series.returns, 20),
      acfSquared: autocorrelationFunction(squared, 20),
      band: autocorrelationConfidenceBand(series.returns.length),
      excessKurtosis: kurtosis(series.returns),
      realisedVol: standardDeviation(series.returns, 1) * Math.sqrt(252),
    };
  }, [series, params.mu]);

  const config: Record<string, number> = { ...params };

  return (
    <LabShell
      lab={lab}
      question="Every other model on this site treats volatility as a constant. If instead today's variance depends on yesterday's surprise, what changes — and can the parameters governing that dependence be recovered from returns alone?"
    >
      <ExperimentSection kind="inputs">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="GARCH(1,1) parameters" subtitle="These generate the data. The lab then tries to recover them from the returns alone." />
            <CardBody className="space-y-4">
              <SliderControl
                label="α — reaction to the last shock"
                value={liveParams.alpha}
                min={0} max={0.3} step={0.005}
                onChange={(v) => update("alpha", v)}
                format={(v) => v.toFixed(3)}
                hint="How violently variance responds to a surprise. Higher α means volatility spikes sharply after a large move."
              />
              <SliderControl
                label="β — persistence of past variance"
                value={liveParams.beta}
                min={0} max={0.99} step={0.005}
                onChange={(v) => update("beta", v)}
                format={(v) => v.toFixed(3)}
                hint="How much of yesterday's variance carries into today. Higher β means volatility decays slowly once elevated."
              />
              <div
                className={`rounded-card border px-3 py-2.5 ${stationary ? "border-line bg-surface-sunken" : "border-negative bg-negative/10"}`}
              >
                <p className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                  Persistence α + β
                </p>
                <p className={`tabular mt-1 text-lg font-semibold ${stationary ? "text-ink" : "text-negative"}`}>
                  {ratio(persistence, 4)}
                </p>
                <p className="mt-1 text-2xs leading-relaxed text-ink-muted">
                  {stationary ? (
                    <>
                      Stationary. Shock half-life {ratio(volatilityHalfLife(trueParams), 1)} days; long-run
                      volatility {percent(Math.sqrt(longRunVariance(trueParams) * 252), 1)}.
                    </>
                  ) : (
                    <>
                      <strong className="text-negative">Non-stationary (IGARCH).</strong> At α + β ≥ 1 shocks
                      never decay and there is no long-run variance to revert to. Simulation is disabled.
                    </>
                  )}
                </p>
              </div>
              <NumberField
                label="ω — constant term"
                value={liveParams.omega}
                onChange={(v) => update("omega", Math.max(1e-9, v))}
                min={1e-9} step={0.000001}
                hint="Sets the floor on variance and, with α and β, pins the long-run level at ω/(1−α−β)."
              />
              <SliderControl
                label="μ — mean return"
                value={liveParams.mu}
                min={-0.002} max={0.002} step={0.0001}
                onChange={(v) => update("mu", v)}
                format={(v) => `${(v * 100).toFixed(3)}%/day`}
              />
              <SliderControl
                label="Trading days"
                value={liveParams.steps}
                min={252} max={7560} step={252}
                onChange={(v) => update("steps", v)}
                format={(v) => `${integer(v)} (${(v / 252).toFixed(0)}y)`}
              />
              <NumberField
                label="Random seed"
                value={liveParams.seed}
                onChange={(v) => update("seed", Math.max(0, Math.floor(v)))}
                min={0} step={1}
              />
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <Button size="sm" onClick={() => update("seed", Math.floor(Math.random() * 1_000_000))}>
                  New seed
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setParams({ ...GARCH_DEFAULTS, alpha: 0.001, beta: 0.001 })}>
                  Turn clustering off
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setParams(GARCH_DEFAULTS)}>
                  Reset
                </Button>
              </div>
            </CardBody>
          </Card>

          <div className="space-y-4">
            {!stationary ? (
              <Callout tone="caution" title="α + β must be below 1">
                <p>
                  At α + β ≥ 1 the process is IGARCH: a shock to variance never decays, the unconditional
                  variance is infinite, and there is no long-run level to revert to. Lower α or β to continue.
                </p>
                <p>
                  This is not a technicality. Fitted equity models routinely land at 0.98 or 0.99 — close
                  enough to the boundary that volatility shocks take months to fade, which is precisely why
                  a calm period is genuine information about tomorrow.
                </p>
              </Callout>
            ) : series && diagnostics ? (
              <>
                <MetricGrid>
                  <MetricCard
                    label="Long-run volatility"
                    value={percent(Math.sqrt(longRunVariance(trueParams) * 252), 2)}
                    hint="√(ω/(1−α−β)), annualised. The level the process reverts to."
                  />
                  <MetricCard
                    label="Realised volatility"
                    value={percent(diagnostics.realisedVol, 2)}
                    footnote="This sample"
                  />
                  <MetricCard
                    label="Shock half-life"
                    value={`${ratio(volatilityHalfLife(trueParams), 1)} days`}
                    hint="ln(0.5)/ln(α+β) — how long until half of a volatility shock has decayed."
                  />
                  <MetricCard
                    label="Excess kurtosis"
                    value={ratio(diagnostics.excessKurtosis, 2)}
                    tone={diagnostics.excessKurtosis > 0.5 ? "caution" : "neutral"}
                    hint="Above zero means fat tails. GARCH produces them from purely Gaussian shocks, because mixing over a changing variance is not Gaussian."
                  />
                </MetricGrid>

                <Card>
                  <CardHeader
                    title="Returns and the conditional volatility that generated them"
                    subtitle="The volatility path is not a smoothed version of the returns — it is the forecast the model made before each one."
                  />
                  <CardBody className="space-y-3">
                    <MultiLineChart
                      series={[{ key: "r", label: "Daily return", values: series.returns, color: "var(--series-1)", width: 0.7 }]}
                      title="Daily returns"
                      description="Returns over time, with visibly alternating calm and turbulent stretches — the amplitude changes rather than staying constant."
                      xLabel="Trading day"
                      yLabel="Return"
                      formatY={(v) => percent(v, 1)}
                      referenceY={0}
                      height={200}
                      showLegend={false}
                    />
                    <MultiLineChart
                      series={[
                        { key: "vol", label: "True conditional volatility", values: series.volatilities, color: "var(--series-5)", width: 1.6 },
                        ...(fittedPath ? [{ key: "fit", label: "Recovered from returns alone", values: fittedPath, color: "var(--series-3)", dashed: true, width: 1.4 }] : []),
                        { key: "lr", label: "Long-run level", values: series.volatilities.map(() => Math.sqrt(longRunVariance(trueParams) * 252)), color: "var(--ink-faint)", dashed: true, width: 1 },
                      ]}
                      title="Conditional volatility"
                      description="Annualised conditional volatility spiking after large moves and decaying back toward its long-run level, with the fitted estimate tracking it closely."
                      xLabel="Trading day"
                      yLabel="Annualised volatility"
                      formatY={(v) => percent(v, 0)}
                      height={240}
                      footnote="The dashed green line was estimated from the returns alone, with no knowledge of the true volatility path. That it tracks the solid line is the entire practical claim of GARCH."
                    />
                  </CardBody>
                </Card>
              </>
            ) : null}
          </div>
        </div>
      </ExperimentSection>

      <ExperimentSection kind="model">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="The model" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="Returns"
                equation={"r_t = \\mu + \\varepsilon_t, \\qquad \\varepsilon_t = \\sigma_t z_t, \\quad z_t \\sim N(0,1)"}
                description="The shock is a standard normal scaled by a time-varying volatility."
              />
              <EquationBlock
                label="Variance recursion"
                equation={"\\sigma_t^2 = \\omega + \\alpha\\,\\varepsilon_{t-1}^2 + \\beta\\,\\sigma_{t-1}^2"}
                description="Today's variance depends on yesterday's squared surprise and yesterday's variance."
                where={[
                  { symbol: "\\omega", meaning: "constant; sets the floor and, with α and β, the long-run level" },
                  { symbol: "\\alpha", meaning: "reaction — how hard variance jumps after a shock" },
                  { symbol: "\\beta", meaning: "persistence — how much of yesterday's variance carries forward" },
                ]}
              />
              <Callout tone="accent" title="Why σ_t is a forecast, not a description">
                <p>
                  The recursion uses <InlineMath>{"\\varepsilon_{t-1}"}</InlineMath> and{" "}
                  <InlineMath>{"\\sigma_{t-1}"}</InlineMath> — information available <em>before</em> period t.
                  So <InlineMath>{"\\sigma_t"}</InlineMath> is genuinely predicted in advance rather than
                  measured afterwards.
                </p>
                <p>
                  That one subscript is what makes GARCH useful and is the same discipline as the one-step lag
                  in the Backtesting Lab. Using <InlineMath>{"\\varepsilon_t"}</InlineMath> on the right-hand
                  side would let the model see the shock it is supposed to be forecasting.
                </p>
              </Callout>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Persistence is the number that matters" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="Long-run variance"
                equation={"\\sigma_\\infty^2 = \\frac{\\omega}{1 - \\alpha - \\beta}"}
                description="Exists only when α + β < 1. As the sum approaches 1 the denominator vanishes and the long-run level diverges."
              />
              <EquationBlock
                label="Half-life of a shock"
                equation={"t_{1/2} = \\frac{\\ln 0.5}{\\ln(\\alpha + \\beta)}"}
                description="How many periods until half of a volatility shock has decayed."
              />
              <p className="text-xs leading-relaxed text-ink-muted">
                At your settings, α + β = {ratio(persistence, 4)}, giving a half-life of{" "}
                {stationary ? `${ratio(volatilityHalfLife(trueParams), 1)} days` : "infinite"}. Fitted equity
                models routinely sit around 0.98–0.99, implying half-lives of a month or more. That is why a
                turbulent week is genuine information about the following month — and why it is <em>not</em>{" "}
                information about the direction of returns.
              </p>
              <EquationBlock
                label="Multi-period forecast"
                equation={"E\\!\\left[\\sigma_{t+h}^2\\right] = \\sigma_\\infty^2 + (\\alpha+\\beta)^{h-1}\\left(\\sigma_{t+1}^2 - \\sigma_\\infty^2\\right)"}
                description="The forecast decays geometrically from today's level toward the long-run level, at exactly the persistence rate."
              />
            </CardBody>
          </Card>
        </div>
      </ExperimentSection>

      <ExperimentSection kind="results" title="Can the parameters be recovered?">
        {series && fit ? (
          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Maximum likelihood estimation"
                subtitle="Fitting the model to its own simulated output, using only the returns."
              />
              <CardBody>
                <DataTable
                  columns={["Parameter", "True value", "Estimated", "Error"]}
                  align={["left", "right", "right", "right"]}
                  caption="The parameters are constrained (ω > 0, α + β < 1), so the optimiser works in a transformed space where every point maps to an admissible model."
                  rows={[
                    ["ω", fmtNumber(params.omega, 9), fmtNumber(fit.params.omega, 9), percent(fit.params.omega / params.omega - 1, 1)],
                    ["α", ratio(params.alpha, 4), ratio(fit.params.alpha, 4), ratio(fit.params.alpha - params.alpha, 4)],
                    ["β", ratio(params.beta, 4), ratio(fit.params.beta, 4), ratio(fit.params.beta - params.beta, 4)],
                    [
                      <strong key="p" className="text-ink">α + β (persistence)</strong>,
                      <strong key="pt" className="text-ink">{ratio(persistence, 4)}</strong>,
                      <strong key="pe" className="text-ink">{ratio(fit.persistence, 4)}</strong>,
                      <strong key="pd" className={Math.abs(fit.persistence - persistence) < 0.03 ? "text-positive" : "text-caution"}>
                        {ratio(fit.persistence - persistence, 4)}
                      </strong>,
                    ],
                    [
                      "Long-run volatility",
                      percent(Math.sqrt(longRunVariance(trueParams) * 252), 2),
                      percent(fit.longRunVolatility, 2),
                      percent(fit.longRunVolatility / Math.sqrt(longRunVariance(trueParams) * 252) - 1, 1),
                    ],
                    ["Half-life (days)", ratio(volatilityHalfLife(trueParams), 1), ratio(fit.halfLife, 1), ratio(fit.halfLife - volatilityHalfLife(trueParams), 1)],
                  ]}
                />
              </CardBody>
            </Card>

            <FindingBlock
              observation={
                <>
                  Fitting by maximum likelihood to {integer(params.steps)} simulated returns recovered a
                  persistence of <strong className="text-ink">{ratio(fit.persistence, 4)}</strong> against a
                  true value of {ratio(persistence, 4)}, and a long-run volatility of{" "}
                  {percent(fit.longRunVolatility, 2)} against {percent(Math.sqrt(longRunVariance(trueParams) * 252), 2)}.
                  The individual α and β estimates are noticeably less accurate than their sum.
                </>
              }
              interpretation={
                <>
                  <p>
                    That α and β are individually harder to pin down than α + β is not a defect of the
                    optimiser — it is a property of the likelihood surface. Trading a little α for a little β
                    barely changes the fit, so the likelihood has a long flat ridge along the line
                    α + β = constant. The sum is sharply determined; the split along the ridge is not.
                  </p>
                  <p className="mt-2">
                    This is why practitioners report persistence and half-life rather than α and β separately,
                    and it is a good general lesson: a parameter being poorly estimated often says more about
                    the shape of the likelihood than about the data.
                  </p>
                </>
              }
              conclusion={
                <>
                  Volatility dynamics are recoverable from returns alone. The quantity that is reliably
                  estimable is the persistence, which is also the one that matters for forecasting.
                </>
              }
              limitation={
                <>
                  I generated this data from a GARCH process, so a GARCH model fits it by construction. That
                  tests the estimator, not the model&rsquo;s suitability for markets. Real returns are also
                  fat-tailed conditionally — the Gaussian likelihood used here understates tail risk even
                  after the volatility dynamics are accounted for, which is why Student-t GARCH exists. And
                  GARCH is symmetric: it treats a large fall and a large rise identically, whereas real equity
                  volatility rises more after falls.
                </>
              }
            />

            {diagnostics ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Autocorrelation of returns" subtitle="Should be flat — GARCH does not make returns predictable." />
                  <CardBody>
                    <SimpleBarChart
                      data={diagnostics.acfReturns.map((v, i) => ({ lag: String(i + 1), acf: v }))}
                      xKey="lag"
                      bars={[{ key: "acf", label: "ACF of returns", color: "var(--series-1)" }]}
                      title="Return autocorrelation"
                      description="Bars scattered close to zero across all lags, indicating no linear predictability in returns."
                      formatY={(v) => v.toFixed(3)}
                      height={220}
                      footnote={`95% noise band is ±${ratio(diagnostics.band, 4)}. Returns are essentially unpredictable.`}
                    />
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Autocorrelation of squared returns" subtitle="Should be strongly positive — volatility IS predictable." />
                  <CardBody>
                    <SimpleBarChart
                      data={diagnostics.acfSquared.map((v, i) => ({ lag: String(i + 1), acf: v }))}
                      xKey="lag"
                      bars={[{ key: "acf", label: "ACF of squared returns", color: "var(--series-5)" }]}
                      title="Squared-return autocorrelation"
                      description="Bars clearly positive and decaying slowly across lags, the signature of volatility clustering."
                      formatY={(v) => v.toFixed(3)}
                      height={220}
                      footnote="This pair of charts is the whole point: unpredictable returns alongside highly predictable volatility. It is the most robust empirical pattern in finance, and GARCH exists to reproduce it."
                    />
                  </CardBody>
                </Card>
              </div>
            ) : null}
          </div>
        ) : null}
      </ExperimentSection>

      <ExperimentSection kind="simulation" title="Forecasting">
        {stationary ? (
          <Card>
            <CardHeader
              title="Where volatility goes after a shock"
              subtitle="Starting from an elevated variance, the forecast decays geometrically toward the long-run level."
            />
            <CardBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <SliderControl
                  label="Starting variance, as a multiple of long-run"
                  value={liveParams.shockMultiple}
                  min={0.2} max={8} step={0.1}
                  onChange={(v) => update("shockMultiple", v)}
                  format={(v) => `${v.toFixed(1)}×`}
                />
                <SliderControl
                  label="Forecast horizon"
                  value={liveParams.forecastHorizon}
                  min={20} max={500} step={10}
                  onChange={(v) => update("forecastHorizon", v)}
                  format={(v) => `${v} days`}
                />
              </div>

              <MultiLineChart
                series={[
                  { key: "f", label: "Forecast volatility", values: forecast.map((f) => f.annualisedVolatility), color: "var(--series-2)", width: 2.2 },
                  { key: "lr", label: "Long-run level", values: forecast.map(() => Math.sqrt(longRunVariance(trueParams) * 252)), color: "var(--ink-faint)", dashed: true },
                ]}
                title="Volatility term structure after a shock"
                description="Forecast volatility decaying from an elevated starting level toward the long-run level, quickly at first and then slowly."
                xLabel="Days ahead"
                yLabel="Annualised volatility"
                formatY={(v) => percent(v, 0)}
                height={280}
                footnote={`At persistence ${ratio(persistence, 3)}, half the gap closes in ${ratio(volatilityHalfLife(trueParams), 1)} days. This decaying curve is the term structure of volatility, and it is what makes options at different expiries price off different implied volatilities.`}
              />

              <Callout tone="accent" title="What GARCH does and does not forecast">
                <p>
                  It forecasts <strong className="text-ink">variance</strong>, not direction. Nothing in the
                  model says anything about whether returns will be positive or negative — the return
                  autocorrelation chart above is flat by construction.
                </p>
                <p>
                  That is a smaller claim than predicting prices, and it is also a claim that actually holds
                  up out of sample. Volatility forecasting works; return forecasting mostly does not. The
                  difference is signal-to-noise: variance is estimable from a few weeks of data, whereas a
                  mean return needs years.
                </p>
              </Callout>
            </CardBody>
          </Card>
        ) : null}
      </ExperimentSection>

      <ExperimentSection kind="assumptions">
        <Card>
          <CardBody>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[
                { title: "Conditionally normal shocks", body: "Given the variance, returns are Gaussian. Real returns are fat-tailed even after conditioning, which is why Student-t GARCH exists." },
                { title: "Symmetric response", body: "A large fall and a large rise of the same size raise variance identically. Real equity volatility rises more after falls — the leverage effect, which GJR-GARCH and EGARCH address." },
                { title: "Constant parameters", body: "ω, α and β never change. Over long samples they visibly do." },
                { title: "One lag of each", body: "GARCH(1,1) uses only yesterday's shock and variance. Longer memory needs higher orders, though (1,1) is usually hard to beat." },
                { title: "Stationarity", body: "α + β < 1 is required for a long-run variance to exist. Fitted values sit uncomfortably close to the boundary." },
                { title: "Variance is observable enough", body: "Estimation uses squared returns as the signal, which is an extremely noisy proxy for variance — one observation per day." },
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

      <ExperimentSection kind="limitations">
        <Callout tone="caution" title="Fitting a GARCH model to GARCH data proves only that the estimator works">
          <p>
            The recovery demonstrated above is a test of the maximum likelihood routine, not evidence that
            markets are GARCH. The data was generated by the same equations the estimator assumes, which is
            the easiest possible case.
          </p>
          <p>
            What makes GARCH worth knowing is narrower and better supported: volatility clustering is real and
            robust, and a model that captures it forecasts variance meaningfully better than assuming a
            constant. That is a genuine result. It is also the limit of the claim — GARCH says nothing about
            returns, and a model fitted in calm conditions will still be surprised by a regime change.
          </p>
        </Callout>
      </ExperimentSection>

      <ReproducibilityPanel
        title="GARCH Volatility Lab"
        prefix="GARCH"
        config={config}
        labels={GARCH_LABELS}
        basePath="/labs/garch"
        exports={
          series
            ? [
                {
                  label: "Export series (CSV)",
                  filename: `quantverge-garch-${params.seed}.csv`,
                  mime: "text/csv",
                  build: () =>
                    toCSV(
                      series.returns.map((r, i) => ({
                        day: i,
                        return: r.toFixed(8),
                        conditional_variance: series.variances[i].toExponential(8),
                        annualised_volatility: series.volatilities[i].toFixed(6),
                        fitted_volatility: fittedPath ? fittedPath[i].toFixed(6) : "",
                      })),
                    ),
                },
                {
                  label: "Export fit (JSON)",
                  filename: `quantverge-garch-fit-${params.seed}.json`,
                  mime: "application/json",
                  build: () =>
                    JSON.stringify(
                      {
                        experiment: "GARCH Volatility Lab",
                        true_parameters: trueParams,
                        true_persistence: persistence,
                        true_long_run_volatility: Math.sqrt(longRunVariance(trueParams) * 252),
                        fitted: fit,
                        log_likelihood_at_truth: garchLogLikelihood(series.returns, trueParams),
                        diagnostics: diagnostics
                          ? { excess_kurtosis: diagnostics.excessKurtosis, realised_volatility: diagnostics.realisedVol }
                          : null,
                        note: "Data generated by a GARCH process, so a GARCH fit succeeding tests the estimator rather than the model's realism.",
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
