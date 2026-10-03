"use client";

import { useMemo, useState } from "react";
import {
  Button, Callout, Card, CardBody, CardHeader, MetricCard, MetricGrid,
  SliderControl, NumberField, DataTable,
} from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";
import { ExperimentSection, FindingBlock, ResearchOnly } from "@/components/labs/ExperimentSection";
import { LabShell, ReproducibilityPanel } from "@/components/labs/LabShell";
import { MultiLineChart, SimpleBarChart } from "@/components/charts";
import { useDebounced } from "@/lib/hooks/useBatchedSimulation";
import {
  mertonModel, creditSpreadTermStructure, impliedEquityVolatility, portfolioLossDistribution,
} from "@/lib/finance/credit";
import { toCSV } from "@/lib/experiment/config";
import { percent, ratio, integer, currency } from "@/lib/format";
import type { LabMeta } from "@/content/labs";
import { CREDIT_DEFAULTS, CREDIT_LABELS, SPREAD_MATURITIES, type CreditLabParams } from "@/lib/labs/credit";

export function CreditLab({ lab, initialParams }: { lab: LabMeta; initialParams: CreditLabParams }) {
  const [liveParams, setParams] = useState<CreditLabParams>(initialParams);
  const params = useDebounced(liveParams, 170);

  const update = <K extends keyof CreditLabParams>(key: K, value: CreditLabParams[K]) =>
    setParams((previous) => ({ ...previous, [key]: value }));

  const inputs = useMemo(
    () => ({
      assetValue: params.assetValue,
      debtFaceValue: params.debtFaceValue,
      maturity: params.maturity,
      assetVolatility: params.assetVolatility,
      riskFreeRate: params.riskFreeRate,
      assetDrift: params.assetDrift,
    }),
    [params],
  );

  const result = useMemo(() => mertonModel(inputs), [inputs]);
  const equityVol = useMemo(() => impliedEquityVolatility(inputs), [inputs]);
  const termStructure = useMemo(
    () => creditSpreadTermStructure(inputs, SPREAD_MATURITIES),
    [inputs],
  );

  /** Equity and debt value across a range of firm values — the payoff picture. */
  const payoffProfile = useMemo(() => {
    const assets: number[] = [];
    const equity: number[] = [];
    const debt: number[] = [];
    const equityAtMaturity: number[] = [];
    for (let i = 0; i <= 60; i++) {
      const v = (params.debtFaceValue * 2.2 * i) / 60 + 1;
      assets.push(v);
      const r = mertonModel({ ...inputs, assetValue: v });
      equity.push(r.equityValue);
      debt.push(r.debtValue);
      equityAtMaturity.push(Math.max(0, v - params.debtFaceValue));
    }
    return { assets, equity, debt, equityAtMaturity };
  }, [inputs, params.debtFaceValue]);

  const lossDistribution = useMemo(
    () =>
      portfolioLossDistribution(
        params.portfolioSize,
        result.realWorldDefaultProbability,
        params.lossGivenDefault,
      ),
    [params.portfolioSize, params.lossGivenDefault, result.realWorldDefaultProbability],
  );

  const portfolioStats = useMemo(() => {
    const expected = lossDistribution.reduce((a, d) => a + d.defaults * d.probability, 0);
    const variance = lossDistribution.reduce(
      (a, d) => a + (d.defaults - expected) ** 2 * d.probability, 0,
    );
    // 99th percentile of the loss distribution.
    let cumulative = 0;
    let p99 = 0;
    for (const d of lossDistribution) {
      cumulative += d.probability;
      if (cumulative >= 0.99) { p99 = d.lossFraction; break; }
    }
    return { expectedDefaults: expected, sd: Math.sqrt(variance), p99 };
  }, [lossDistribution]);

  const config: Record<string, number> = { ...params };

  return (
    <LabShell
      lab={lab}
      question="Every bond in the Fixed Income lab was assumed to pay in full. If a firm can instead fail, what is its debt worth — and why does that question turn out to be an options problem?"
    >
      <ExperimentSection kind="inputs">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="The firm" subtitle="A company funded by equity plus one zero-coupon debt issue." />
            <CardBody className="space-y-4">
              <NumberField
                label="Asset value V"
                value={liveParams.assetValue}
                onChange={(v) => update("assetValue", Math.max(1, v))}
                min={1} step={5} suffix="$m"
                hint="The market value of everything the firm owns. Not directly observable in practice — which is the model's central practical difficulty."
              />
              <NumberField
                label="Debt face value D"
                value={liveParams.debtFaceValue}
                onChange={(v) => update("debtFaceValue", Math.max(0.01, v))}
                min={0.01} step={5} suffix="$m"
                hint="What must be repaid at maturity. This is the strike price of the option that equity turns out to be."
              />
              <SliderControl
                label="Debt maturity"
                value={liveParams.maturity}
                min={0.25} max={20} step={0.25}
                onChange={(v) => update("maturity", v)}
                format={(v) => `${v} yr`}
              />
              <SliderControl
                label="Asset volatility"
                value={liveParams.assetVolatility}
                min={0.05} max={0.8} step={0.01}
                onChange={(v) => update("assetVolatility", v)}
                format={(v) => percent(v, 0)}
                hint="How uncertain the firm's value is. Higher volatility helps equity holders — they have limited downside — and hurts creditors, which is the structural conflict at the heart of corporate finance."
              />
              <SliderControl
                label="Risk-free rate"
                value={liveParams.riskFreeRate}
                min={0} max={0.15} step={0.0025}
                onChange={(v) => update("riskFreeRate", v)}
                format={(v) => percent(v, 2)}
              />
              <SliderControl
                label="Expected asset growth"
                value={liveParams.assetDrift}
                min={-0.1} max={0.25} step={0.005}
                onChange={(v) => update("assetDrift", v)}
                format={(v) => percent(v, 1)}
                hint="Used ONLY for the real-world default probability. The price of the debt never depends on it, which is the risk-neutral pricing result again."
              />
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <Button size="sm" onClick={() => update("debtFaceValue", params.assetValue * 0.95)}>
                  Make it distressed
                </Button>
                <Button size="sm" variant="ghost" onClick={() => update("debtFaceValue", params.assetValue * 0.2)}>
                  Make it safe
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setParams(CREDIT_DEFAULTS)}>
                  Reset
                </Button>
              </div>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <MetricGrid>
              <MetricCard
                label="Equity value"
                value={currency(result.equityValue, 2)}
                hint="Priced as a call option on the firm's assets, struck at the face value of its debt."
              />
              <MetricCard
                label="Debt value"
                value={currency(result.debtValue, 2)}
                footnote={`Risk-free it would be ${currency(result.riskFreeDebtValue, 2)}`}
              />
              <MetricCard
                label="Credit spread"
                value={`${(result.creditSpread * 10000).toFixed(0)} bp`}
                tone={result.creditSpread > 0.03 ? "negative" : result.creditSpread > 0.01 ? "caution" : "positive"}
                hint="The extra yield creditors demand. Implied by leverage and volatility rather than estimated separately."
              />
              <MetricCard
                label="Distance to default"
                value={ratio(result.distanceToDefault, 2)}
                tone={result.distanceToDefault > 3 ? "positive" : result.distanceToDefault > 1.5 ? "caution" : "negative"}
                hint="How many standard deviations of asset value sit between the firm and its default point. The most used credit metric in practice."
              />
              <MetricCard
                label="Default probability (real-world)"
                value={percent(result.realWorldDefaultProbability, 2)}
                tone={result.realWorldDefaultProbability > 0.1 ? "negative" : "neutral"}
              />
              <MetricCard
                label="Default probability (risk-neutral)"
                value={percent(result.riskNeutralDefaultProbability, 2)}
                tone="caution"
                hint="What prices the debt. Systematically higher than the real-world figure, because it embeds the risk premium investors demand."
              />
              <MetricCard label="Expected recovery" value={percent(result.recoveryRate, 1)} />
              <MetricCard
                label="Implied equity volatility"
                value={percent(equityVol, 1)}
                footnote={`Assets: ${percent(params.assetVolatility, 1)}`}
                hint="Equity is a levered claim, so it is always more volatile than the assets beneath it."
              />
            </MetricGrid>

            <Card>
              <CardHeader
                title="Equity and debt against firm value"
                subtitle="The kink at D is the whole model: below it the equity holders walk away."
              />
              <CardBody>
                <MultiLineChart
                  series={[
                    { key: "equity", label: "Equity value today", values: payoffProfile.equity, color: "var(--series-1)", width: 2.2 },
                    { key: "debt", label: "Debt value today", values: payoffProfile.debt, color: "var(--series-3)", width: 2 },
                    { key: "payoff", label: "Equity payoff at maturity", values: payoffProfile.equityAtMaturity, color: "var(--ink-faint)", dashed: true },
                  ]}
                  title="Claims on the firm"
                  description="Equity value rising from near zero and curving upward with firm value, debt value rising then flattening as it approaches its face value, and the kinked equity payoff at maturity shown as a dashed line."
                  xLabel="Firm asset value"
                  yLabel="Value"
                  formatX={(i) => `$${payoffProfile.assets[Math.round(i)]?.toFixed(0) ?? ""}`}
                  formatY={(v) => `$${v.toFixed(0)}`}
                  height={320}
                  footnote={`The dashed line is max(V − D, 0) — exactly a call payoff struck at ${currency(params.debtFaceValue, 0)}. The solid equity curve sits above it by the time value, just as any option does. Debt flattens out at its face value because creditors can never receive more than they are owed.`}
                />
              </CardBody>
            </Card>
          </div>
        </div>
      </ExperimentSection>

      <ExperimentSection kind="model">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Equity is a call option" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="Equity payoff at maturity"
                equation={"E_T = \\max(V_T - D,\; 0)"}
                description="If the firm is worth more than the debt, shareholders repay and keep the rest. If not, limited liability lets them hand over the firm and walk away."
              />
              <p className="text-xs leading-relaxed text-ink-muted">
                That is a call payoff, with the firm&rsquo;s assets as the underlying and the face value of
                the debt as the strike. So Black-Scholes prices it directly:
              </p>
              <EquationBlock
                equation={"E_0 = V_0\\,N(d_1) - D e^{-rT} N(d_2)"}
                description="The same formula as the Options Lab, with different labels on the inputs."
              />
              <EquationBlock
                label="Debt is the remainder"
                equation={"B_0 = V_0 - E_0"}
                description="The firm's value splits entirely between its two claimants, so whatever equity is not worth, the debt is."
              />
              <Callout tone="accent" title="Why this reframing is worth having">
                <p>
                  It converts an apparently separate problem — how likely is this company to fail? — into one
                  already solved. Default probability becomes{" "}
                  <InlineMath>{"N(-d_2)"}</InlineMath>, the probability the call expires worthless. The credit
                  spread becomes a price difference. Recovery becomes a conditional expectation.
                </p>
                <p>
                  It also explains a real conflict: raising asset volatility <em>increases</em> equity value
                  and <em>decreases</em> debt value. Shareholders have limited downside, so they benefit from
                  risk; creditors have capped upside, so they do not. Drag the volatility slider and watch the
                  two numbers move in opposite directions.
                </p>
              </Callout>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Default, spread and distance" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="Default probability"
                equation={"P(\\text{default}) = N(-d_2) = N\\!\\left(-\\frac{\\ln(V/D) + (\\mu - \\sigma_V^2/2)T}{\\sigma_V\\sqrt{T}}\\right)"}
                description="Use r for the risk-neutral figure that prices the debt; use the true expected growth μ for the real-world figure."
              />
              <EquationBlock
                label="Credit spread"
                equation={"s = -\\frac{1}{T}\\ln\\!\\left(\\frac{B_0}{De^{-rT}}\\right)"}
                description="The yield pickup implied by the debt trading below its risk-free value."
              />
              <EquationBlock
                label="Distance to default"
                equation={"DD = \\frac{\\ln(V/D) + (\\mu - \\sigma_V^2/2)T}{\\sigma_V\\sqrt{T}}"}
                description="How many standard deviations of asset value separate the firm from its default point."
              />
              <Callout tone="caution" title="Two probabilities, and they are not the same">
                <p>
                  Your firm&rsquo;s risk-neutral default probability is{" "}
                  {percent(result.riskNeutralDefaultProbability, 2)} while the real-world figure is{" "}
                  {percent(result.realWorldDefaultProbability, 2)}. The gap is the risk premium.
                </p>
                <p>
                  Risk-neutral probabilities are what price securities; real-world probabilities are what
                  actually happen. Quoting one as the other is a standard error, and it always runs the same
                  way — spreads imply far more defaults than are ever observed, because investors demand
                  compensation for bearing the risk as well as for the expected loss itself.
                </p>
              </Callout>
            </CardBody>
          </Card>
        </div>
      </ExperimentSection>

      <ExperimentSection kind="results" title="The term structure, and where the model breaks">
        <Card>
          <CardHeader
            title="Credit spread by maturity"
            subtitle="Look hard at the short end."
          />
          <CardBody className="space-y-4">
            <MultiLineChart
              series={[
                { key: "spread", label: "Credit spread", values: termStructure.map((t) => t.spread * 10000), color: "var(--series-5)", width: 2.2 },
              ]}
              title="Credit spread term structure"
              description="Spread rising from essentially zero at very short maturities, peaking at an intermediate horizon, and then flattening or declining for long maturities."
              xLabel="Maturity (years)"
              yLabel="Spread (bp)"
              formatX={(i) => `${SPREAD_MATURITIES[Math.round(i)] ?? ""}y`}
              formatY={(v) => `${v.toFixed(0)}`}
              height={290}
              showLegend={false}
              footnote={`At ${SPREAD_MATURITIES[0]} years the model gives ${(termStructure[0].spread * 10000).toFixed(2)}bp. Real one-month credit spreads are never zero — which is the model's best-known failure and the strongest evidence that firms default through sudden shocks rather than a slow drift downward.`}
            />

            <FindingBlock
              observation={
                <>
                  With assets of {currency(params.assetValue, 0)}m against {currency(params.debtFaceValue, 0)}m
                  of debt at {percent(params.assetVolatility, 0)} volatility, the model gives a{" "}
                  {params.maturity}-year credit spread of{" "}
                  <strong className="text-ink">{(result.creditSpread * 10000).toFixed(0)}bp</strong> and a
                  distance to default of {ratio(result.distanceToDefault, 2)}. At the shortest maturity shown
                  the spread falls to <strong className="text-ink">{(termStructure[0].spread * 10000).toFixed(2)}bp</strong>.
                </>
              }
              interpretation={
                <>
                  <p>
                    The vanishing short-maturity spread is not a numerical artefact — it is what the model
                    genuinely implies. Asset value follows a continuous diffusion, so a firm currently above
                    its default point cannot get below it in an arbitrarily short time. Default becomes
                    predictable just before it happens, and predictable risk commands no premium.
                  </p>
                  <p className="mt-2">
                    Real short-dated spreads are substantial. That discrepancy is the single most informative
                    thing about this model: it tells you firms fail through <em>jumps</em> — fraud discovered,
                    a counterparty failing, funding withdrawn overnight — rather than through a slow slide.
                    Every later structural model exists to patch this, usually by adding jumps or by making
                    the default barrier uncertain.
                  </p>
                </>
              }
              conclusion={
                <>
                  Merton is not an accurate pricing model and was not really meant as one. Its value is that it
                  makes credit risk a function of things you can reason about — leverage, volatility, horizon —
                  and gives distance to default, which remains a genuinely useful ranking measure even where
                  the spread it implies is wrong.
                </>
              }
              limitation={
                <>
                  The deeper problem is that asset value and asset volatility are <strong className="text-ink">
                  not observable</strong>. You can see a company&rsquo;s share price and its equity volatility,
                  not the market value of its assets. Real implementations solve the pricing equation and the
                  equity-volatility relation simultaneously to back out both unknowns — which is what Moody&rsquo;s
                  KMV commercialised. The model also assumes a single zero-coupon debt issue maturing on one
                  date, where real firms have layered, covenanted, staggered obligations.
                </>
              }
            />

            <ResearchOnly>
              <DataTable
                columns={["Maturity", "Spread (bp)", "Risk-neutral default probability", "Annualised hazard"]}
                align={["right", "right", "right", "right"]}
                caption="The annualised hazard rate is −ln(1 − PD)/T, which makes default probabilities comparable across horizons."
                rows={termStructure.map((t) => [
                  `${t.maturity}y`,
                  (t.spread * 10000).toFixed(2),
                  percent(t.defaultProbability, 3),
                  percent(t.defaultProbability > 0 ? -Math.log(1 - t.defaultProbability) / t.maturity : 0, 3),
                ])}
              />
            </ResearchOnly>
          </CardBody>
        </Card>
      </ExperimentSection>

      <ExperimentSection kind="simulation" title="A portfolio of independent borrowers">
        <Card>
          <CardHeader
            title="Why independence is the wrong assumption"
            subtitle="Assuming defaults are independent gives a comfortingly tight loss distribution. That assumption is the one that failed in 2008."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SliderControl
                label="Number of exposures"
                value={liveParams.portfolioSize}
                min={10} max={300} step={10}
                onChange={(v) => update("portfolioSize", v)}
                format={(v) => integer(v)}
              />
              <SliderControl
                label="Loss given default"
                value={liveParams.lossGivenDefault}
                min={0.1} max={1} step={0.05}
                onChange={(v) => update("lossGivenDefault", v)}
                format={(v) => percent(v, 0)}
              />
            </div>

            <MetricGrid className="sm:grid-cols-3 lg:grid-cols-3">
              <MetricCard
                label="Expected defaults"
                value={ratio(portfolioStats.expectedDefaults, 2)}
                footnote={`of ${integer(params.portfolioSize)}`}
              />
              <MetricCard label="Standard deviation" value={ratio(portfolioStats.sd, 2)} />
              <MetricCard
                label="99th percentile loss"
                value={percent(portfolioStats.p99, 2)}
                tone="caution"
              />
            </MetricGrid>

            <SimpleBarChart
              data={lossDistribution
                .filter((d) => d.probability > 0.0001)
                .slice(0, 40)
                .map((d) => ({ defaults: String(d.defaults), probability: d.probability }))}
              xKey="defaults"
              bars={[{ key: "probability", label: "Probability", color: "var(--series-1)" }]}
              title="Distribution of defaults, assuming independence"
              description="A tight, roughly bell-shaped distribution concentrated near the expected number of defaults, with very little probability in the tail."
              formatY={(v) => percent(v, 1)}
              height={250}
              footnote="Notice how narrow this is. With independent borrowers, the chance of many simultaneous defaults is vanishingly small — which is exactly the reasoning that made pools of mortgages look safe."
            />

            <Callout tone="caution" title="The assumption that matters most is the one not modelled here">
              <p>
                This distribution assumes every borrower fails independently. Under that assumption the law of
                large numbers does its work: with {integer(params.portfolioSize)} exposures the loss rate
                concentrates tightly around {percent(result.realWorldDefaultProbability * params.lossGivenDefault, 2)},
                and extreme outcomes are essentially impossible.
              </p>
              <p>
                Real borrowers are not independent. They share an economy, and in a downturn they fail
                together. Correlated defaults make the tail of this distribution enormously fatter without
                changing the expected loss at all — the mean is identical, the tail is not. Pricing a portfolio
                off its expected loss while assuming independence is, in compressed form, what went wrong with
                structured credit in 2008.
              </p>
              <p>
                The Correlation Lab makes the same point for returns; here the consequences are larger, because
                credit losses are bounded above but the tail is where all the risk lives.
              </p>
            </Callout>
          </CardBody>
        </Card>
      </ExperimentSection>

      <ExperimentSection kind="assumptions">
        <Card>
          <CardBody>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[
                { title: "Asset value follows GBM", body: "Continuous paths, constant volatility, no jumps. The vanishing short-maturity spread is a direct consequence, and it is wrong." },
                { title: "A single zero-coupon debt issue", body: "One face value, one maturity. Real firms have layered debt with different seniorities, covenants and staggered maturities." },
                { title: "Default only at maturity", body: "The firm cannot fail before T even if assets collapse in between. First-passage models relax this." },
                { title: "Asset value is observable", body: "It is not. Only equity value and equity volatility can be seen, and the two unknowns must be solved for jointly." },
                { title: "No bankruptcy costs", body: "Creditors receive the full remaining asset value. Real recoveries are reduced by legal costs, delay and asset fire-sales." },
                { title: "Independent defaults, in the portfolio section", body: "Stated explicitly because it is the assumption most responsible for underestimated credit losses." },
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
        <Callout tone="caution" title="A framework for thinking, not a pricing engine">
          <p>
            Merton systematically underpredicts observed credit spreads, especially at short maturities and
            for high-quality firms — a discrepancy large enough to have its own name, the credit spread
            puzzle. Part of it is the missing jump risk; part is liquidity premia the model has no way to
            represent.
          </p>
          <p>
            What survives is the way of thinking. Equity as an option on the firm explains why shareholders
            like risk and creditors do not, why distressed equity trades like an out-of-the-money call, and
            why distance to default ranks firms sensibly even when the spread it implies is too low. Those
            insights are robust to the model being wrong about prices.
          </p>
          <p>
            Nothing here is an assessment of any real company&rsquo;s creditworthiness. The firm is synthetic
            and its asset value is a number you typed — in reality that is the one quantity you cannot look up.
          </p>
        </Callout>
      </ExperimentSection>

      <ReproducibilityPanel
        title="Credit Risk Lab"
        prefix="CR"
        config={config}
        labels={CREDIT_LABELS}
        basePath="/labs/credit"
        exports={[
          {
            label: "Export term structure (CSV)",
            filename: `quantverge-credit-${params.debtFaceValue}.csv`,
            mime: "text/csv",
            build: () =>
              toCSV(
                termStructure.map((t) => ({
                  maturity_years: t.maturity,
                  credit_spread_bp: (t.spread * 10000).toFixed(4),
                  risk_neutral_default_probability: t.defaultProbability.toFixed(8),
                })),
              ),
          },
          {
            label: "Export analysis (JSON)",
            filename: `quantverge-credit-${params.debtFaceValue}.json`,
            mime: "application/json",
            build: () =>
              JSON.stringify(
                {
                  experiment: "Credit Risk Lab",
                  model: "Merton structural model",
                  parameters: config,
                  result,
                  implied_equity_volatility: equityVol,
                  term_structure: termStructure,
                  portfolio: { ...portfolioStats, exposures: params.portfolioSize, assumesIndependence: true },
                  note: "Synthetic firm. Asset value and asset volatility are inputs here; in practice neither is observable.",
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
