"use client";

import { useMemo, useState } from "react";
import { useDebounced } from "@/lib/hooks/useBatchedSimulation";
import {
  Button, Callout, Card, CardBody, CardHeader, MetricCard, MetricGrid,
  SliderControl, NumberField, Toggle, DataTable, ErrorState,
} from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";
import { ExperimentSection, FindingBlock, ResearchOnly } from "@/components/labs/ExperimentSection";
import { LabShell, ReproducibilityPanel } from "@/components/labs/LabShell";
import { ScatterPlot, SimpleBarChart } from "@/components/charts";
import { CorrelationHeatmap, WeightBar } from "@/components/charts/Heatmap";
import {
  computePortfolioMetrics, generateRandomPortfolios, minimumVariancePortfolio,
  maxSharpePortfolio, efficientFrontier, normaliseWeights, frontierEnvelope,
} from "@/lib/finance/portfolio";
import { covarianceFromCorrelation, isValidCorrelationMatrix } from "@/lib/math/linearAlgebra";
import { toCSV } from "@/lib/experiment/config";
import { percent, ratio, integer } from "@/lib/format";
import type { LabMeta } from "@/content/labs";
import {
  PORTFOLIO_DEFAULTS, PORTFOLIO_LABELS, ASSET_NAMES, ASSET_COLORS,
  correlationMatrixFrom, type PortfolioLabParams,
} from "@/lib/labs/portfolio";

const RETURN_KEYS = ["r0", "r1", "r2", "r3"] as const;
const VOL_KEYS = ["v0", "v1", "v2", "v3"] as const;
const WEIGHT_KEYS = ["w0", "w1", "w2", "w3"] as const;
const CORR_KEYS: Record<string, keyof PortfolioLabParams> = {
  "0-1": "c01", "0-2": "c02", "0-3": "c03", "1-2": "c12", "1-3": "c13", "2-3": "c23",
};

export function PortfolioLab({ lab, initialParams }: { lab: LabMeta; initialParams: PortfolioLabParams }) {
  const [liveParams, setParams] = useState<PortfolioLabParams>(initialParams);
  /**
   * `liveParams` updates on every mousemove so the slider thumb tracks the
   * finger. Everything downstream — the simulation AND the chart props — reads
   * the debounced copy instead, so dragging triggers one recompute and one chart
   * render rather than one per pixel. The chart captions are also more honest
   * this way: they describe the parameters that were actually simulated, not a
   * value the slider is still travelling through.
   */
  const params = useDebounced(liveParams, 160);

  const update = <K extends keyof PortfolioLabParams>(key: K, value: PortfolioLabParams[K]) =>
    setParams((previous) => ({ ...previous, [key]: value }));

  const allowShort = params.allowShort === 1;

  const expectedReturns = useMemo(() => RETURN_KEYS.map((k) => params[k]), [params]);
  const volatilities = useMemo(() => VOL_KEYS.map((k) => params[k]), [params]);
  const correlation = useMemo(() => correlationMatrixFrom(params), [params]);

  /**
   * Validate the correlation matrix before doing anything with it. A user can
   * easily specify a set of correlations that no four assets could actually
   * have — the matrix must be positive semi-definite, which is a global
   * constraint that individual sliders cannot enforce locally.
   */
  const validity = useMemo(() => isValidCorrelationMatrix(correlation), [correlation]);

  const covariance = useMemo(
    () => covarianceFromCorrelation(correlation, volatilities),
    [correlation, volatilities],
  );

  // The user's weights, normalised so they sum to 1 — the budget constraint.
  const weights = useMemo(() => normaliseWeights(WEIGHT_KEYS.map((k) => params[k])), [params]);

  const selected = useMemo(
    () => (validity.valid ? computePortfolioMetrics(weights, expectedReturns, covariance, params.riskFreeRate) : null),
    [weights, expectedReturns, covariance, params.riskFreeRate, validity.valid],
  );

  const cloud = useMemo(
    () =>
      validity.valid
        ? generateRandomPortfolios(
            expectedReturns, covariance, params.randomPortfolios, params.seed, allowShort, params.riskFreeRate,
          )
        : [],
    [expectedReturns, covariance, params.randomPortfolios, params.seed, allowShort, params.riskFreeRate, validity.valid],
  );

  const optimal = useMemo(() => {
    if (!validity.valid) return null;
    if (allowShort) {
      // With short selling the problem has a closed form, so we solve it exactly.
      const mvp = minimumVariancePortfolio(covariance);
      const tangency = maxSharpePortfolio(expectedReturns, covariance, params.riskFreeRate);
      return {
        exact: true,
        minVariance: mvp ? computePortfolioMetrics(mvp, expectedReturns, covariance, params.riskFreeRate) : null,
        maxSharpe: tangency ? computePortfolioMetrics(tangency, expectedReturns, covariance, params.riskFreeRate) : null,
      };
    }
    // With a no-short constraint there is no closed form — it is a quadratic
    // program. Rather than pretend otherwise, we take the best portfolios found
    // in the random sample and say plainly that they are approximate.
    if (cloud.length === 0) return null;
    const bestSharpe = cloud.reduce((best, p) => (p.sharpeRatio > best.sharpeRatio ? p : best), cloud[0]);
    const lowestVol = cloud.reduce((best, p) => (p.volatility < best.volatility ? p : best), cloud[0]);
    return {
      exact: false,
      minVariance: computePortfolioMetrics(lowestVol.weights, expectedReturns, covariance, params.riskFreeRate),
      maxSharpe: computePortfolioMetrics(bestSharpe.weights, expectedReturns, covariance, params.riskFreeRate),
    };
  }, [validity.valid, allowShort, covariance, expectedReturns, params.riskFreeRate, cloud]);

  const frontier = useMemo(() => {
    if (!validity.valid) return [];
    if (allowShort) {
      return efficientFrontier(expectedReturns, covariance, 90).map((p) => ({
        x: p.volatility, y: p.expectedReturn,
      }));
    }
    // Under constraints, the upper envelope of the sampled cloud approximates
    // the frontier.
    return frontierEnvelope(cloud, 44).map((p) => ({ x: p.volatility, y: p.expectedReturn }));
  }, [validity.valid, allowShort, expectedReturns, covariance, cloud]);

  const sharpeRange = useMemo(() => {
    if (cloud.length === 0) return { min: 0, max: 1 };
    const values = cloud.map((p) => p.sharpeRatio);
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [cloud]);

  /** Equal-weight benchmark, a famously hard portfolio to beat out of sample. */
  const equalWeight = useMemo(
    () =>
      validity.valid
        ? computePortfolioMetrics([0.25, 0.25, 0.25, 0.25], expectedReturns, covariance, params.riskFreeRate)
        : null,
    [validity.valid, expectedReturns, covariance, params.riskFreeRate],
  );

  const config: Record<string, number> = { ...params };

  return (
    <LabShell
      lab={lab}
      question="Given a set of assets with known expected returns, volatilities and correlations, which combinations are efficient — and how much of the risk reduction comes from the correlations rather than from the individual assets?"
    >
      <ExperimentSection kind="inputs">
        {!validity.valid ? (
          <div className="mb-4">
            <ErrorState
              title="These correlations are not mathematically possible"
              description={`${validity.reason} Correlation matrices must be positive semi-definite — you cannot, for example, have A and B strongly positively correlated, B and C strongly positively correlated, and A and C strongly negatively correlated at the same time. Adjust one of the correlations to continue.`}
              onRetry={() => setParams(PORTFOLIO_DEFAULTS)}
            />
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card>
              <CardHeader title="Assets" subtitle="Expected return and volatility, both annualised." />
              <CardBody className="space-y-4">
                {ASSET_NAMES.map((name, i) => (
                  <div key={name} className="space-y-2 border-l-2 pl-3" style={{ borderColor: ASSET_COLORS[i] }}>
                    <p className="text-xs font-semibold" style={{ color: ASSET_COLORS[i] }}>{name}</p>
                    <SliderControl
                      label="Expected return"
                      value={params[RETURN_KEYS[i]]}
                      min={-0.05} max={0.3} step={0.005}
                      onChange={(v) => update(RETURN_KEYS[i], v)}
                      format={(v) => percent(v, 1)}
                    />
                    <SliderControl
                      label="Volatility"
                      value={params[VOL_KEYS[i]]}
                      min={0.01} max={0.6} step={0.005}
                      onChange={(v) => update(VOL_KEYS[i], v)}
                      format={(v) => percent(v, 1)}
                    />
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Your portfolio" subtitle="Weights are normalised to sum to 1 automatically." />
              <CardBody className="space-y-3">
                {ASSET_NAMES.map((name, i) => (
                  <SliderControl
                    key={name}
                    label={name}
                    value={params[WEIGHT_KEYS[i]]}
                    min={allowShort ? -1 : 0}
                    max={2}
                    step={0.01}
                    onChange={(v) => update(WEIGHT_KEYS[i], v)}
                    format={(v) => percent(v / Math.max(0.0001, WEIGHT_KEYS.reduce((s, k) => s + params[k], 0)), 1)}
                  />
                ))}
                <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                  <Button size="sm" onClick={() => setParams((p) => ({ ...p, w0: 0.25, w1: 0.25, w2: 0.25, w3: 0.25 }))}>
                    Equal weight
                  </Button>
                  {optimal?.minVariance ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        setParams((p) => ({
                          ...p,
                          w0: optimal.minVariance!.weights[0], w1: optimal.minVariance!.weights[1],
                          w2: optimal.minVariance!.weights[2], w3: optimal.minVariance!.weights[3],
                        }))
                      }
                    >
                      Min variance
                    </Button>
                  ) : null}
                  {optimal?.maxSharpe ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        setParams((p) => ({
                          ...p,
                          w0: optimal.maxSharpe!.weights[0], w1: optimal.maxSharpe!.weights[1],
                          w2: optimal.maxSharpe!.weights[2], w3: optimal.maxSharpe!.weights[3],
                        }))
                      }
                    >
                      Max Sharpe
                    </Button>
                  ) : null}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Constraints" />
              <CardBody className="space-y-3.5">
                <Toggle
                  label="Allow short selling"
                  checked={allowShort}
                  onChange={(v) => update("allowShort", v ? 1 : 0)}
                  hint="Permitting negative weights expands the feasible set and allows an exact closed-form frontier. Without it the problem needs quadratic programming, so the frontier shown is an approximation from the sampled cloud."
                />
                <SliderControl
                  label="Risk-free rate"
                  value={liveParams.riskFreeRate}
                  min={0} max={0.1} step={0.0025}
                  onChange={(v) => update("riskFreeRate", v)}
                  format={(v) => percent(v, 2)}
                  hint="Used in the Sharpe ratio and to locate the tangency portfolio. Raising it rotates the tangency line and shifts which portfolio is optimal."
                />
                <SliderControl
                  label="Random portfolios"
                  value={liveParams.randomPortfolios}
                  min={500} max={20000} step={500}
                  onChange={(v) => update("randomPortfolios", v)}
                  format={(v) => integer(v)}
                />
                <NumberField
                  label="Random seed"
                  value={liveParams.seed}
                  onChange={(v) => update("seed", Math.max(0, Math.floor(v)))}
                  min={0} step={1}
                />
                <Button size="sm" variant="ghost" onClick={() => setParams(PORTFOLIO_DEFAULTS)}>
                  Reset everything
                </Button>
              </CardBody>
            </Card>
          </div>

          <div className="space-y-4">
            {validity.valid && selected ? (
              <>
                <MetricGrid>
                  <MetricCard
                    label="Expected return"
                    value={percent(selected.expectedReturn, 2)}
                    hint="wᵀμ — a plain weighted average, entirely unaffected by correlation."
                  />
                  <MetricCard
                    label="Volatility"
                    value={percent(selected.volatility, 2)}
                    hint="√(wᵀΣw) — this is where correlation enters, through the cross terms."
                  />
                  <MetricCard
                    label="Sharpe ratio"
                    value={ratio(selected.sharpeRatio, 3)}
                    tone={selected.sharpeRatio > 0.5 ? "positive" : selected.sharpeRatio > 0 ? "neutral" : "negative"}
                    hint="Excess return per unit of volatility. Higher is better, but it says nothing about tail risk."
                  />
                  <MetricCard
                    label="Diversification ratio"
                    value={ratio(selected.diversificationRatio, 3)}
                    tone={selected.diversificationRatio < 0.9 ? "positive" : "neutral"}
                    hint="Portfolio volatility divided by the weighted average of the assets' volatilities. Below 1 means the correlations are doing work for you; exactly 1 means they are not."
                  />
                </MetricGrid>

                <Card>
                  <CardHeader
                    title="The feasible set and the efficient frontier"
                    subtitle={`${integer(cloud.length)} random portfolios, coloured by Sharpe ratio. The dark curve is the frontier.`}
                  />
                  <CardBody>
                    <ScatterPlot
                      points={cloud.map((p) => ({ x: p.volatility, y: p.expectedReturn, z: p.sharpeRatio }))}
                      frontier={frontier}
                      highlights={[
                        ...(optimal?.minVariance
                          ? [{ x: optimal.minVariance.volatility, y: optimal.minVariance.expectedReturn, label: "Minimum variance", color: "var(--series-3)" }]
                          : []),
                        ...(optimal?.maxSharpe
                          ? [{ x: optimal.maxSharpe.volatility, y: optimal.maxSharpe.expectedReturn, label: "Maximum Sharpe", color: "var(--series-2)" }]
                          : []),
                        { x: selected.volatility, y: selected.expectedReturn, label: "Your portfolio", color: "var(--negative)" },
                      ]}
                      colorBy={sharpeRange}
                      title="Risk-return space"
                      description={`A cloud of ${integer(cloud.length)} randomly weighted portfolios forming a bullet shape in volatility-return space, bounded above and to the left by the efficient frontier. The minimum-variance, maximum-Sharpe and user-selected portfolios are marked with stars.`}
                      xLabel="Volatility"
                      yLabel="Expected return"
                      height={380}
                      footnote={
                        optimal?.exact
                          ? "Frontier computed in closed form by solving the constrained minimisation at each target return."
                          : "With short selling disabled there is no closed-form frontier, so this curve is the upper envelope of the sampled cloud — an approximation that improves with more random portfolios."
                      }
                    />
                  </CardBody>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader title="Allocation" subtitle="Capital share of each asset in your portfolio." />
                    <CardBody>
                      <WeightBar weights={weights} labels={ASSET_NAMES} colors={ASSET_COLORS} />
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader
                      title="Risk contribution"
                      subtitle="Share of total portfolio risk, which is not the same as share of capital."
                    />
                    <CardBody>
                      <SimpleBarChart
                        data={ASSET_NAMES.map((name, i) => ({
                          name: name.split(" ")[0],
                          capital: weights[i],
                          risk: selected.riskContributions[i],
                        }))}
                        xKey="name"
                        bars={[
                          { key: "capital", label: "Share of capital", color: "var(--series-1)" },
                          { key: "risk", label: "Share of risk", color: "var(--series-5)" },
                        ]}
                        title="Capital vs risk"
                        description="Paired bars comparing each asset's share of invested capital against its share of total portfolio risk. Volatile and highly correlated assets consume more risk than capital."
                        formatY={(v) => percent(v, 0)}
                        height={220}
                        footnote="Where the risk bar exceeds the capital bar, that asset is consuming more of the risk budget than its allocation suggests."
                      />
                    </CardBody>
                  </Card>
                </div>

                <Card>
                  <CardHeader
                    title="Correlation matrix"
                    subtitle="Editable. Click any off-diagonal cell and type a value between −1 and +1."
                  />
                  <CardBody>
                    <CorrelationHeatmap
                      matrix={correlation}
                      labels={ASSET_NAMES}
                      caption="Pairwise correlations. Blue is positive, red is negative; the printed number is always shown so the data never depends on colour alone."
                      onChange={(i, j, value) => {
                        const key = CORR_KEYS[`${Math.min(i, j)}-${Math.max(i, j)}`];
                        if (key) update(key, value as never);
                      }}
                    />
                  </CardBody>
                </Card>
              </>
            ) : null}
          </div>
        </div>
      </ExperimentSection>

      {/* ---------------- Model ---------------- */}
      <ExperimentSection kind="model">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Return is linear. Risk is not." />
            <CardBody className="space-y-3">
              <EquationBlock
                label="Expected portfolio return"
                equation={"E(R_p) = \\mathbf{w}^{\\!\\top}\\boldsymbol{\\mu} = \\sum_{i} w_i \\mu_i"}
                description="Expectation is a linear operator, so there are no correction terms and no dependence on correlation whatsoever. Combining assets never creates or destroys expected return."
                where={[
                  { symbol: "\\mathbf{w}", meaning: "the vector of portfolio weights, summing to 1" },
                  { symbol: "\\boldsymbol{\\mu}", meaning: "the vector of expected returns" },
                ]}
              />
              <EquationBlock
                label="Portfolio variance"
                equation={"\\sigma_p^2 = \\mathbf{w}^{\\!\\top}\\boldsymbol{\\Sigma}\\mathbf{w} = \\sum_i\\sum_j w_i w_j \\sigma_{ij}"}
                description="A quadratic form. This is where diversification lives."
                where={[
                  { symbol: "\\boldsymbol{\\Sigma}", meaning: "the covariance matrix, with Σᵢⱼ = ρᵢⱼ σᵢ σⱼ" },
                ]}
              />
              <Callout tone="accent" title="Where the free lunch comes from">
                <p>
                  For two assets the variance expands to{" "}
                  <InlineMath>{"w_1^2\\sigma_1^2 + w_2^2\\sigma_2^2 + 2w_1w_2\\rho\\sigma_1\\sigma_2"}</InlineMath>
                  . Look at the last term: it carries <InlineMath>{"\\rho"}</InlineMath>, and{" "}
                  <InlineMath>{"\\rho"}</InlineMath> can be negative. When it is, that term{" "}
                  <em>subtracts</em> from total variance, and the portfolio becomes less risky than either of
                  its parts.
                </p>
                <p>
                  For <InlineMath>{"n"}</InlineMath> assets there are <InlineMath>{"n"}</InlineMath> variance
                  terms but <InlineMath>{"n(n-1)"}</InlineMath> covariance terms. In any portfolio of
                  reasonable size, risk is dominated by how assets move <em>together</em>, not by how volatile
                  they are individually. That asymmetry — linear returns, quadratic risk — is the entire
                  mathematical content of diversification.
                </p>
              </Callout>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="The two optimal portfolios" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="Global minimum variance"
                equation={"\\mathbf{w}_{\\text{mv}} = \\frac{\\boldsymbol{\\Sigma}^{-1}\\mathbf{1}}{\\mathbf{1}^{\\!\\top}\\boldsymbol{\\Sigma}^{-1}\\mathbf{1}}"}
                description="Note what is absent: expected returns. The lowest-risk portfolio depends only on the covariance structure — which is useful, because covariances can be estimated far more reliably than expected returns."
              />
              <EquationBlock
                label="Maximum Sharpe (tangency)"
                equation={"\\mathbf{w}_{\\text{ms}} \;\\propto\; \\boldsymbol{\\Sigma}^{-1}(\\boldsymbol{\\mu} - r_f\\mathbf{1})"}
                description="Then normalised to sum to 1. Geometrically, the point where a line from the risk-free rate is tangent to the frontier."
              />
              <Callout tone="caution" title="Why this is less useful than it looks">
                <p>
                  Both formulas invert the covariance matrix, and matrix inversion <em>amplifies</em> estimation
                  error. The tangency portfolio is especially fragile: it multiplies{" "}
                  <InlineMath>{"\\Sigma^{-1}"}</InlineMath> by estimated expected returns, which are the single
                  hardest quantity in finance to measure. Nudge one expected return by a fraction of a percent
                  and watch the optimal weights swing wildly.
                </p>
                <p>
                  Try it: move a slider slightly and see how much the max-Sharpe allocation changes. This
                  instability is the main reason naive Markowitz optimisation performs badly out of sample, and
                  why practitioners add constraints, shrink their estimates toward a prior, or simply use
                  equal weights.
                </p>
              </Callout>
            </CardBody>
          </Card>
        </div>
      </ExperimentSection>

      {/* ---------------- Assumptions ---------------- */}
      <ExperimentSection kind="assumptions">
        <Card>
          <CardBody>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[
                { title: "Parameters are known exactly", body: "μ, σ and ρ are treated as given. In reality all are estimated with substantial error, and expected returns are so noisy that decades of data barely pin them down." },
                { title: "Parameters are stable", body: "The covariance matrix does not change over the holding period. Correlations in particular are strongly time-varying." },
                { title: "Risk means variance", body: "Volatility is the only risk measure in the objective. It penalises upside and downside equally and is blind to skew and fat tails — see the Risk Analyzer for alternatives." },
                { title: "Returns are elliptically distributed", body: "Mean-variance optimality requires either quadratic utility or an elliptical return distribution. Neither holds exactly for real assets." },
                { title: "Perfect divisibility and no costs", body: "Any weight is achievable at no cost. Rebalancing to an optimal portfolio incurs real transaction costs, which can exceed the optimisation's benefit." },
                { title: "A single period", body: "The model optimises one holding period in isolation, with no path dependence, no rebalancing policy and no consumption." },
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

      {/* ---------------- Results ---------------- */}
      <ExperimentSection kind="results">
        {validity.valid && selected && optimal && equalWeight ? (
          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Portfolio comparison"
                subtitle={
                  optimal.exact
                    ? "Optimal portfolios solved in closed form."
                    : "Optimal portfolios approximated from the random sample, because the no-short constraint has no closed-form solution."
                }
              />
              <CardBody>
                <DataTable
                  columns={["Portfolio", "Expected return", "Volatility", "Sharpe", "Diversification", ...ASSET_NAMES.map((n) => n.split(" ")[0])]}
                  align={["left", "right", "right", "right", "right", "right", "right", "right", "right"]}
                  caption="All four portfolios evaluated under the same assumptions. Weights may not sum visibly to 100% when short selling is enabled."
                  rows={[
                    ["Your portfolio", selected, "var(--negative)"],
                    ["Equal weight", equalWeight, "var(--ink-muted)"],
                    ...(optimal.minVariance ? [["Minimum variance", optimal.minVariance, "var(--series-3)"] as const] : []),
                    ...(optimal.maxSharpe ? [["Maximum Sharpe", optimal.maxSharpe, "var(--series-2)"] as const] : []),
                  ].map(([label, metrics, color]) => {
                    const m = metrics as NonNullable<typeof selected>;
                    return [
                      <span key={String(label)} style={{ color: color as string }}>{label as string}</span>,
                      percent(m.expectedReturn, 2),
                      percent(m.volatility, 2),
                      ratio(m.sharpeRatio, 3),
                      ratio(m.diversificationRatio, 3),
                      ...m.weights.map((w, i) => <span key={i}>{percent(w, 1)}</span>),
                    ];
                  })}
                />
              </CardBody>
            </Card>

            <FindingBlock
              observation={
                <>
                  Your portfolio has expected return {percent(selected.expectedReturn, 2)} and volatility{" "}
                  {percent(selected.volatility, 2)}, for a Sharpe ratio of {ratio(selected.sharpeRatio, 3)}.
                  The weighted average of the four assets&rsquo; individual volatilities is{" "}
                  {percent(
                    weights.reduce((sum, w, i) => sum + Math.abs(w) * volatilities[i], 0),
                    2,
                  )}
                  , so the portfolio is{" "}
                  <strong className="text-ink">
                    {percent(1 - selected.diversificationRatio, 1)} less volatile
                  </strong>{" "}
                  than the sum of its parts.
                </>
              }
              interpretation={
                <>
                  That reduction is pure diversification, and it is produced entirely by the off-diagonal
                  entries of the covariance matrix. Set every correlation to +1 and it vanishes completely:
                  the diversification ratio becomes exactly 1, and the frontier collapses to a straight line,
                  because with perfectly correlated assets there is nothing left to cancel.
                </>
              }
              conclusion={
                <>
                  Under these assumptions, correlation structure accounts for a larger share of achievable risk
                  reduction than the choice of individual assets does.
                </>
              }
              limitation={
                <>
                  Every number here is conditional on expected returns, volatilities and correlations that you
                  supplied as if they were known. In practice all three must be estimated, and they change.
                  Correlations in particular tend to rise toward 1 during crises — which means the
                  diversification benefit computed in calm conditions partially disappears at exactly the
                  moment it is needed. This model cannot represent that at all.
                </>
              }
            />

            <ResearchOnly>
              <Card>
                <CardHeader title="Covariance matrix" subtitle="Σᵢⱼ = ρᵢⱼ σᵢ σⱼ. The diagonal entries are the variances." />
                <CardBody>
                  <CorrelationHeatmap
                    matrix={covariance}
                    labels={ASSET_NAMES}
                    format={(v) => v.toFixed(4)}
                    caption="Raw covariances. These are the numbers the optimiser actually consumes; the correlation matrix above is a human-readable reparameterisation of this."
                  />
                </CardBody>
              </Card>
            </ResearchOnly>
          </div>
        ) : null}
      </ExperimentSection>

      {/* ---------------- Limitations ---------------- */}
      <ExperimentSection kind="limitations">
        <Callout tone="caution" title="The estimation problem is the real problem">
          <p>
            This lab hands you a covariance matrix and asks you to optimise. That is the easy half. The hard
            half — which the lab deliberately assumes away — is that nobody knows{" "}
            <InlineMath>{"\\boldsymbol{\\mu}"}</InlineMath>. The standard error of an estimated expected return
            is roughly <InlineMath>{"\\sigma/\\sqrt{T}"}</InlineMath>: for an asset with 20% volatility, even
            25 years of data leaves a standard error of 4% per year, which is the same order as the quantity
            being estimated.
          </p>
          <p>
            Because the optimiser treats its inputs as exact, it responds to that noise by taking enormous
            positions in whichever asset happened to have the highest estimated return. This is why
            mean-variance optimisers are sometimes described as &ldquo;error maximisers&rdquo;, and why an
            equal-weight portfolio — which uses no estimates at all — is a genuinely difficult benchmark to
            beat out of sample.
          </p>
          <p>
            Nothing here constitutes investment advice. The assets are synthetic, their parameters are
            whatever you typed, and the conclusions are statements about the algebra of weighted sums.
          </p>
        </Callout>
      </ExperimentSection>

      <ReproducibilityPanel
        title="Portfolio Optimizer"
        prefix="PORT"
        config={config}
        labels={PORTFOLIO_LABELS}
        basePath="/labs/portfolio-optimizer"
        exports={
          cloud.length > 0
            ? [
                {
                  label: "Export random portfolios (CSV)",
                  filename: `quantlab-portfolios-${params.seed}.csv`,
                  mime: "text/csv",
                  build: () =>
                    toCSV(
                      cloud.map((p, i) => ({
                        portfolio: i,
                        volatility: p.volatility.toFixed(6),
                        expected_return: p.expectedReturn.toFixed(6),
                        sharpe_ratio: p.sharpeRatio.toFixed(6),
                        ...Object.fromEntries(p.weights.map((w, j) => [`w_${ASSET_NAMES[j].replace(/\s+/g, "_")}`, w.toFixed(6)])),
                      })),
                    ),
                },
                {
                  label: "Export analysis (JSON)",
                  filename: `quantlab-portfolio-${params.seed}.json`,
                  mime: "application/json",
                  build: () =>
                    JSON.stringify(
                      {
                        experiment: "Portfolio Optimizer",
                        model: "Markowitz mean-variance",
                        parameters: config,
                        assets: ASSET_NAMES.map((name, i) => ({
                          name, expected_return: expectedReturns[i], volatility: volatilities[i],
                        })),
                        correlation_matrix: correlation,
                        covariance_matrix: covariance,
                        selected_portfolio: selected,
                        minimum_variance: optimal?.minVariance ?? null,
                        maximum_sharpe: optimal?.maxSharpe ?? null,
                        equal_weight: equalWeight,
                        solution_method: optimal?.exact ? "closed form" : "sampled approximation (no-short constraint)",
                        note: "Synthetic assets. Parameters supplied by the user, not estimated from data.",
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
