"use client";

import { useMemo, useState } from "react";
import {
  Button, Callout, Card, CardBody, CardHeader, MetricCard, MetricGrid,
  SliderControl, NumberField, DataTable,
} from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";
import { ExperimentSection, FindingBlock, ResearchOnly } from "@/components/labs/ExperimentSection";
import { LabShell, ReproducibilityPanel } from "@/components/labs/LabShell";
import { ScatterPlot, MultiLineChart, EquityChart } from "@/components/charts";
import { CorrelationHeatmap } from "@/components/charts/Heatmap";
import { covarianceFromCorrelation } from "@/lib/math/linearAlgebra";
import { simulatePortfolio, portfolioVolatility, portfolioExpectedReturn } from "@/lib/finance/portfolio";
import { correlation as sampleCorrelation, standardDeviation } from "@/lib/statistics/descriptive";
import { maxDrawdown } from "@/lib/finance/performance";
import { toCSV } from "@/lib/experiment/config";
import { percent, ratio, integer } from "@/lib/format";
import type { LabMeta } from "@/content/labs";
import {
  CORRELATION_DEFAULTS, CORRELATION_LABELS, SHOWCASE_RHOS, type CorrelationParams,
} from "@/lib/labs/correlation";

export function CorrelationLab({ lab, initialParams }: { lab: LabMeta; initialParams: CorrelationParams }) {
  const [params, setParams] = useState<CorrelationParams>(initialParams);

  const update = <K extends keyof CorrelationParams>(key: K, value: CorrelationParams[K]) =>
    setParams((previous) => ({ ...previous, [key]: value }));

  const weights = useMemo(() => [params.weightA, 1 - params.weightA], [params.weightA]);
  const expectedReturns = useMemo(() => [params.returnA, params.returnB], [params.returnA, params.returnB]);
  const volatilities = useMemo(() => [params.volA, params.volB], [params.volA, params.volB]);

  const covariance = useMemo(
    () => covarianceFromCorrelation([[1, params.rho], [params.rho, 1]], volatilities),
    [params.rho, volatilities],
  );

  const simulation = useMemo(
    () => simulatePortfolio(weights, expectedReturns, covariance, params.steps, params.seed),
    [weights, expectedReturns, covariance, params.steps, params.seed],
  );

  /** Realised daily returns of each asset, for the scatter plot. */
  const assetReturns = useMemo(() => {
    if (!simulation) return null;
    const toReturns = (path: number[]) => path.slice(1).map((p, i) => p / path[i] - 1);
    return { a: toReturns(simulation.assetPaths[0]), b: toReturns(simulation.assetPaths[1]) };
  }, [simulation]);

  const realisedRho = useMemo(
    () => (assetReturns ? sampleCorrelation(assetReturns.a, assetReturns.b) : 0),
    [assetReturns],
  );

  const analytic = useMemo(() => {
    const vol = portfolioVolatility(weights, covariance);
    const ret = portfolioExpectedReturn(weights, expectedReturns);
    const weightedAvgVol = weights[0] * volatilities[0] + weights[1] * volatilities[1];
    return {
      volatility: vol,
      expectedReturn: ret,
      weightedAverageVolatility: weightedAvgVol,
      diversificationBenefit: weightedAvgVol - vol,
      diversificationRatio: weightedAvgVol > 0 ? vol / weightedAvgVol : 1,
    };
  }, [weights, covariance, expectedReturns, volatilities]);

  /** Portfolio volatility across the full range of weights, at several ρ values. */
  const weightCurves = useMemo(() => {
    const steps = 101;
    const curves: Record<string, number[]> = {};
    for (const rho of SHOWCASE_RHOS) {
      const cov = covarianceFromCorrelation([[1, rho], [rho, 1]], volatilities);
      curves[`rho${rho}`] = Array.from({ length: steps }, (_, i) =>
        portfolioVolatility([i / (steps - 1), 1 - i / (steps - 1)], cov),
      );
    }
    // The user's current correlation, drawn on top.
    curves.current = Array.from({ length: steps }, (_, i) =>
      portfolioVolatility([i / (steps - 1), 1 - i / (steps - 1)], covariance),
    );
    return curves;
  }, [volatilities, covariance]);

  /**
   * The minimum-variance weight for two assets, in closed form:
   *
   *   w* = (σ₂² − ρσ₁σ₂) / (σ₁² + σ₂² − 2ρσ₁σ₂)
   *
   * Derived by differentiating the two-asset variance with respect to w₁ and
   * setting the result to zero.
   */
  const minVarianceWeight = useMemo(() => {
    const [s1, s2] = volatilities;
    const cov12 = params.rho * s1 * s2;
    const denominator = s1 * s1 + s2 * s2 - 2 * cov12;
    if (Math.abs(denominator) < 1e-12) return 0.5;
    return Math.max(0, Math.min(1, (s2 * s2 - cov12) / denominator));
  }, [volatilities, params.rho]);

  const minVarianceVol = useMemo(
    () => portfolioVolatility([minVarianceWeight, 1 - minVarianceWeight], covariance),
    [minVarianceWeight, covariance],
  );

  const config: Record<string, number> = { ...params };

  return (
    <LabShell
      lab={lab}
      question="Two assets, each with a fixed expected return and volatility. What does the correlation between them do to the risk of holding both — and why can combining two risky things produce something less risky than either?"
    >
      <ExperimentSection kind="inputs">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Two assets" />
            <CardBody className="space-y-4">
              <div className="space-y-2.5 border-l-2 pl-3" style={{ borderColor: "var(--series-1)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--series-1)" }}>Asset A</p>
                <SliderControl
                  label="Expected return" value={params.returnA}
                  min={-0.1} max={0.3} step={0.005}
                  onChange={(v) => update("returnA", v)} format={(v) => percent(v, 1)}
                />
                <SliderControl
                  label="Volatility" value={params.volA}
                  min={0.02} max={0.6} step={0.01}
                  onChange={(v) => update("volA", v)} format={(v) => percent(v, 0)}
                />
              </div>
              <div className="space-y-2.5 border-l-2 pl-3" style={{ borderColor: "var(--series-2)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--series-2)" }}>Asset B</p>
                <SliderControl
                  label="Expected return" value={params.returnB}
                  min={-0.1} max={0.3} step={0.005}
                  onChange={(v) => update("returnB", v)} format={(v) => percent(v, 1)}
                />
                <SliderControl
                  label="Volatility" value={params.volB}
                  min={0.02} max={0.6} step={0.01}
                  onChange={(v) => update("volB", v)} format={(v) => percent(v, 0)}
                />
              </div>

              <div className="rounded-card border border-accent-muted bg-accent-muted/10 px-3 py-2.5">
                <SliderControl
                  label="Correlation"
                  symbol={<InlineMath>{"\\rho"}</InlineMath>}
                  value={params.rho}
                  min={-1} max={1} step={0.01}
                  onChange={(v) => update("rho", v)}
                  format={(v) => v.toFixed(2)}
                  hint="The single parameter this whole lab is about. Drag it from +1 to −1 and watch the portfolio volatility collapse while the expected return does not move at all."
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SHOWCASE_RHOS.map((rho) => (
                    <Button key={rho} size="sm" variant={params.rho === rho ? "primary" : "secondary"} onClick={() => update("rho", rho)}>
                      ρ = {rho}
                    </Button>
                  ))}
                </div>
              </div>

              <SliderControl
                label="Weight in A"
                value={params.weightA}
                min={0} max={1} step={0.01}
                onChange={(v) => update("weightA", v)}
                format={(v) => `${percent(v, 0)} / ${percent(1 - v, 0)}`}
              />
              <Button size="sm" onClick={() => update("weightA", minVarianceWeight)}>
                Jump to minimum-variance weight ({percent(minVarianceWeight, 0)})
              </Button>
              <NumberField
                label="Random seed"
                value={params.seed}
                onChange={(v) => update("seed", Math.max(0, Math.floor(v)))}
                min={0} step={1}
              />
              <Button size="sm" variant="ghost" onClick={() => setParams(CORRELATION_DEFAULTS)}>
                Reset
              </Button>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <MetricGrid>
              <MetricCard
                label="Portfolio return"
                value={percent(analytic.expectedReturn, 2)}
                hint="A plain weighted average. Correlation has NO effect on this number whatsoever — move the ρ slider and watch it stay still."
              />
              <MetricCard
                label="Portfolio volatility"
                value={percent(analytic.volatility, 2)}
                tone={analytic.diversificationBenefit > 0.001 ? "positive" : "neutral"}
                hint="This is where correlation enters, through the cross term in the variance formula."
              />
              <MetricCard
                label="Weighted average volatility"
                value={percent(analytic.weightedAverageVolatility, 2)}
                hint="What the volatility would be if the assets moved in perfect lockstep (ρ = +1). The gap below this is the diversification benefit."
              />
              <MetricCard
                label="Risk reduction"
                value={percent(analytic.diversificationBenefit, 2)}
                tone={analytic.diversificationBenefit > 0.001 ? "positive" : "neutral"}
                footnote={`${percent(1 - analytic.diversificationRatio, 1)} lower than the parts`}
              />
            </MetricGrid>

            <Card>
              <CardHeader
                title="Portfolio volatility against allocation"
                subtitle="Each curve is a different correlation. The dip is diversification."
              />
              <CardBody>
                <MultiLineChart
                  series={[
                    ...SHOWCASE_RHOS.map((rho, i) => ({
                      key: `rho${rho}`,
                      label: `ρ = ${rho}`,
                      values: weightCurves[`rho${rho}`],
                      color: ["var(--series-5)", "var(--series-2)", "var(--series-3)", "var(--series-6)", "var(--series-4)"][i],
                      width: 1.3,
                      dashed: true,
                    })),
                    { key: "current", label: `Your ρ = ${params.rho.toFixed(2)}`, values: weightCurves.current, color: "var(--ink)", width: 2.4 },
                  ]}
                  title="Portfolio volatility by weight, for several correlations"
                  description="Portfolio volatility plotted against the weight in asset A, with one curve per correlation value. At ρ = +1 the curve is a straight line; as correlation falls the curve bows downward, and at ρ = −1 it touches zero."
                  xLabel="Weight in asset A"
                  yLabel="Portfolio volatility"
                  formatX={(i) => percent(i / 100, 0)}
                  formatY={(v) => percent(v, 0)}
                  height={320}
                  footnote="At ρ = +1 the curve is perfectly straight — the portfolio volatility is just the weighted average, and diversification does nothing. Every curve below that line is a free reduction in risk at no cost in expected return."
                />
              </CardBody>
            </Card>

            {assetReturns && simulation ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader
                    title="What correlation looks like"
                    subtitle={`Realised sample correlation: ${ratio(realisedRho, 4)} (target ${params.rho.toFixed(2)}).`}
                  />
                  <CardBody>
                    <ScatterPlot
                      points={assetReturns.a
                        .map((a, i) => ({ x: a, y: assetReturns.b[i] }))
                        .filter((_, i) => i % Math.max(1, Math.floor(assetReturns.a.length / 900)) === 0)}
                      title="Daily returns of A against B"
                      description={`Scatter plot of asset A's daily return against asset B's. At ${params.rho.toFixed(2)} correlation the cloud is ${Math.abs(params.rho) > 0.8 ? "a tight ellipse close to a straight line" : Math.abs(params.rho) > 0.3 ? "a tilted ellipse" : "a roughly circular blob with no visible tilt"}.`}
                      xLabel="Asset A return"
                      yLabel="Asset B return"
                      formatX={(v) => percent(v, 1)}
                      formatY={(v) => percent(v, 1)}
                      height={290}
                      footnote="The tilt of the cloud is the correlation; its thickness is what is left over. A circular cloud means zero correlation — knowing A tells you nothing about B."
                    />
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="The resulting portfolio" subtitle="Both assets and the blended portfolio, from the same simulation." />
                  <CardBody>
                    <EquityChart
                      series={[
                        { key: "a", label: "Asset A", values: simulation.assetPaths[0].map((v) => v * 100), color: "var(--series-1)", width: 1.2 },
                        { key: "b", label: "Asset B", values: simulation.assetPaths[1].map((v) => v * 100), color: "var(--series-2)", width: 1.2 },
                        { key: "p", label: "Portfolio", values: simulation.equity.map((v) => v * 100), color: "var(--ink)", width: 2 },
                      ]}
                      title="Asset and portfolio paths"
                      description="Price paths of both assets and of the blended portfolio, all starting at 100. The portfolio line is visibly smoother than either asset when correlation is low."
                      formatY={(v) => `$${v.toFixed(0)}`}
                      yLabel="Value"
                      height={290}
                      footnote={`Realised portfolio volatility ${percent(standardDeviation(simulation.returns, 1) * Math.sqrt(252), 2)} against the analytic ${percent(analytic.volatility, 2)}. Max drawdown ${percent(maxDrawdown(simulation.equity).maxDrawdown, 1)}.`}
                    />
                  </CardBody>
                </Card>
              </div>
            ) : (
              <Callout tone="caution" title="This correlation cannot be simulated">
                <p>
                  At exactly ρ = ±1 the covariance matrix is singular and the Cholesky decomposition fails,
                  because one asset is a perfect linear function of the other — there is no independent second
                  source of randomness to draw. The analytic formulas above remain valid; only the path
                  simulation is unavailable. Move ρ a hair away from the boundary to restore it.
                </p>
              </Callout>
            )}
          </div>
        </div>
      </ExperimentSection>

      {/* ---------------- Model ---------------- */}
      <ExperimentSection kind="model">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="The two-asset variance formula, expanded" />
            <CardBody className="space-y-3">
              <EquationBlock
                equation={"\\sigma_p^2 = w^2\\sigma_1^2 + (1-w)^2\\sigma_2^2 + 2w(1-w)\\rho\\,\\sigma_1\\sigma_2"}
                description="The first two terms are each asset's own contribution. The third is the interaction — and it is the only one that carries ρ."
                where={[
                  { symbol: "w", meaning: "the weight in asset A" },
                  { symbol: "\\rho", meaning: "the correlation between the two assets' returns" },
                ]}
              />
              <p className="text-xs leading-relaxed text-ink-muted">
                Everything in this lab follows from the sign of that third term. When{" "}
                <InlineMath>{"\\rho < 0"}</InlineMath> it is negative, so it <em>subtracts</em> from the total
                variance. The portfolio becomes less risky than the weighted average of its parts — and at{" "}
                <InlineMath>{"\\rho = -1"}</InlineMath>, with the right weights, the variance reaches exactly
                zero.
              </p>
              <EquationBlock
                label="Current values"
                equation={`\\sigma_p^2 = ${(weights[0] ** 2 * volatilities[0] ** 2).toFixed(5)} + ${(weights[1] ** 2 * volatilities[1] ** 2).toFixed(5)} + ${(2 * weights[0] * weights[1] * params.rho * volatilities[0] * volatilities[1]).toFixed(5)} = ${(analytic.volatility ** 2).toFixed(5)}`}
                description="The three terms with your current inputs. Watch the middle sign flip as you drag ρ below zero."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="The perfect hedge" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="Minimum-variance weight"
                equation={"w^* = \\frac{\\sigma_2^2 - \\rho\\sigma_1\\sigma_2}{\\sigma_1^2 + \\sigma_2^2 - 2\\rho\\sigma_1\\sigma_2}"}
                description="Found by differentiating the variance with respect to w and setting the derivative to zero."
              />
              <p className="text-xs leading-relaxed text-ink-muted">
                With your inputs, <InlineMath>{"w^* = "}</InlineMath>
                {percent(minVarianceWeight, 1)}, giving a portfolio volatility of{" "}
                {percent(minVarianceVol, 2)} — compared with {percent(volatilities[0], 1)} for A alone and{" "}
                {percent(volatilities[1], 1)} for B alone.
              </p>
              <Callout tone="accent" title="At ρ = −1 the risk goes to exactly zero">
                <p>
                  Substituting <InlineMath>{"\\rho = -1"}</InlineMath> makes the variance a perfect square:
                </p>
                <p className="my-1">
                  <InlineMath>{"\\sigma_p^2 = \\left(w\\sigma_1 - (1-w)\\sigma_2\\right)^2"}</InlineMath>
                </p>
                <p>
                  which is zero when <InlineMath>{"w = \\sigma_2/(\\sigma_1 + \\sigma_2)"}</InlineMath>. Two
                  volatile assets, combined in that exact ratio, produce a riskless portfolio — every move in
                  one is cancelled exactly by the other.
                </p>
                <p>
                  Perfect negative correlation does not exist between real assets, which is precisely why
                  riskless profit does not sit around waiting to be collected. But the mathematics explains why
                  people search so hard for low-correlation assets: every step ρ takes toward −1 is risk removed
                  at no cost in expected return.
                </p>
              </Callout>
            </CardBody>
          </Card>
        </div>

        <ResearchOnly>
          <Card className="mt-4">
            <CardHeader title="Correlation at a glance" subtitle="How each benchmark correlation changes the portfolio, holding weights and volatilities fixed." />
            <CardBody className="space-y-4">
              <DataTable
                columns={["ρ", "Portfolio volatility", "Risk vs weighted average", "Minimum-variance weight", "Minimum achievable volatility"]}
                align={["right", "right", "right", "right", "right"]}
                caption="Expected return is identical in every row — correlation changes only the risk."
                rows={SHOWCASE_RHOS.map((rho) => {
                  const cov = covarianceFromCorrelation([[1, rho], [rho, 1]], volatilities);
                  const vol = portfolioVolatility(weights, cov);
                  const cov12 = rho * volatilities[0] * volatilities[1];
                  const denom = volatilities[0] ** 2 + volatilities[1] ** 2 - 2 * cov12;
                  const w = Math.abs(denom) < 1e-12 ? 0.5 : Math.max(0, Math.min(1, (volatilities[1] ** 2 - cov12) / denom));
                  return [
                    rho.toFixed(1),
                    percent(vol, 2),
                    percent(vol - analytic.weightedAverageVolatility, 2),
                    percent(w, 1),
                    percent(portfolioVolatility([w, 1 - w], cov), 2),
                  ];
                })}
              />
              <CorrelationHeatmap
                matrix={[[1, params.rho], [params.rho, 1]]}
                labels={["Asset A", "Asset B"]}
                caption="The correlation matrix for this pair."
              />
            </CardBody>
          </Card>
        </ResearchOnly>
      </ExperimentSection>

      <ExperimentSection kind="interpretation">
        <FindingBlock
          observation={
            <>
              With ρ = {params.rho.toFixed(2)} and a {percent(params.weightA, 0)}/{percent(1 - params.weightA, 0)}{" "}
              split, the portfolio has expected return {percent(analytic.expectedReturn, 2)} and volatility{" "}
              {percent(analytic.volatility, 2)}. The weighted average of the two volatilities is{" "}
              {percent(analytic.weightedAverageVolatility, 2)}, so combining them removed{" "}
              <strong className="text-ink">{percent(analytic.diversificationBenefit, 2)}</strong> of volatility.
              The expected return is unchanged by correlation.
            </>
          }
          interpretation={
            <>
              Expected return is linear in the weights, so combining assets can never create or destroy it.
              Risk is quadratic, with a cross term that scales with ρ. That asymmetry — linear reward,
              quadratic risk — is the entire reason diversification works, and it is a statement about algebra
              rather than about markets.
            </>
          }
          conclusion={
            <>
              Lowering correlation reduces portfolio risk without touching expected return. That is the closest
              thing to a free lunch that exists in finance, and it requires no forecasting ability at all.
            </>
          }
          limitation={
            <>
              Correlation is <em>estimated</em>, not given, and it is unstable. The most important empirical
              fact about correlation is that it tends to rise toward 1 during market stress — so the
              diversification benefit computed in calm conditions partially disappears at exactly the moment it
              is needed. Correlation also measures only <em>linear</em> association: two assets can be strongly
              dependent in the tails while showing near-zero correlation overall.
            </>
          }
        />
      </ExperimentSection>

      <ExperimentSection kind="limitations">
        <Callout tone="caution" title="What a single correlation number hides">
          <p>
            Correlation is one number summarising an entire joint distribution. It captures linear association
            and nothing else. Two series can have correlation zero and still be perfectly dependent — if
            <InlineMath>{"\;Y = X^2"}</InlineMath> with X symmetric around zero, the correlation is exactly
            zero while Y is completely determined by X.
          </p>
          <p>
            More damaging in practice: correlation is an average over all market conditions. Assets that look
            comfortably uncorrelated in normal times frequently become strongly correlated in crises, when
            everything is sold at once. A single ρ cannot represent that, and the Gaussian simulation here
            cannot produce it. Modelling it requires copulas or regime-switching structures, which is one of
            the reasons the Market Regime Lab exists.
          </p>
        </Callout>
      </ExperimentSection>

      <ReproducibilityPanel
        title="Correlation Lab"
        prefix="CORR"
        config={config}
        labels={CORRELATION_LABELS}
        basePath="/labs/correlation"
        exports={
          assetReturns && simulation
            ? [
                {
                  label: "Export returns (CSV)",
                  filename: `quantlab-correlation-${params.seed}.csv`,
                  mime: "text/csv",
                  build: () =>
                    toCSV(
                      assetReturns.a.map((a, i) => ({
                        day: i,
                        asset_a_return: a.toFixed(8),
                        asset_b_return: assetReturns.b[i].toFixed(8),
                        portfolio_return: simulation.returns[i].toFixed(8),
                        portfolio_value: simulation.equity[i + 1].toFixed(6),
                      })),
                    ),
                },
                {
                  label: "Export analysis (JSON)",
                  filename: `quantlab-correlation-${params.seed}.json`,
                  mime: "application/json",
                  build: () =>
                    JSON.stringify(
                      {
                        experiment: "Correlation Lab",
                        parameters: config,
                        target_correlation: params.rho,
                        realised_correlation: realisedRho,
                        analytic: analytic,
                        minimum_variance_weight: minVarianceWeight,
                        minimum_variance_volatility: minVarianceVol,
                        note: "Synthetic assets with correlation imposed via Cholesky decomposition.",
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
