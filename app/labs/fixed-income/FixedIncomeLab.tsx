"use client";

import { useMemo, useState } from "react";
import {
  Button, Callout, Card, CardBody, CardHeader, MetricCard, MetricGrid,
  SliderControl, NumberField, SelectField, DataTable,
} from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";
import { ExperimentSection, FindingBlock, ResearchOnly } from "@/components/labs/ExperimentSection";
import { LabShell, ReproducibilityPanel } from "@/components/labs/LabShell";
import { MultiLineChart, SimpleBarChart } from "@/components/charts";
import { useDebounced } from "@/lib/hooks/useBatchedSimulation";
import {
  bondCashFlows, bondPrice, bondRiskMeasures, approximatePriceChange,
  buildYieldCurve, forwardRate, priceFromCurve, type BondSpec,
} from "@/lib/finance/fixedIncome";
import { toCSV } from "@/lib/experiment/config";
import { percent, ratio, currency, number as fmtNumber, integer } from "@/lib/format";
import type { LabMeta } from "@/content/labs";
import {
  FIXED_INCOME_DEFAULTS, FIXED_INCOME_LABELS, CURVE_LABELS, type FixedIncomeParams,
} from "@/lib/labs/fixedIncome";

const CURVE_MATURITIES = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30];

export function FixedIncomeLab({ lab, initialParams }: { lab: LabMeta; initialParams: FixedIncomeParams }) {
  const [liveParams, setParams] = useState<FixedIncomeParams>(initialParams);
  const params = useDebounced(liveParams, 160);

  const update = <K extends keyof FixedIncomeParams>(key: K, value: FixedIncomeParams[K]) =>
    setParams((previous) => ({ ...previous, [key]: value }));

  const bond: BondSpec = useMemo(
    () => ({
      faceValue: params.faceValue,
      couponRate: params.couponRate,
      maturity: params.maturity,
      frequency: params.frequency,
    }),
    [params],
  );

  const measures = useMemo(() => bondRiskMeasures(bond, params.yieldRate), [bond, params.yieldRate]);
  const flows = useMemo(() => bondCashFlows(bond), [bond]);

  /** Price against yield, with the duration tangent drawn alongside. */
  const priceYieldCurve = useMemo(() => {
    const yields: number[] = [];
    const exact: number[] = [];
    const durationOnly: number[] = [];
    const withConvexity: number[] = [];
    const lo = Math.max(0, params.yieldRate - 0.05);
    const hi = params.yieldRate + 0.05;
    for (let i = 0; i <= 100; i++) {
      const y = lo + ((hi - lo) * i) / 100;
      const dy = y - params.yieldRate;
      const approx = approximatePriceChange(measures, dy);
      yields.push(y);
      exact.push(bondPrice(bond, y));
      durationOnly.push(measures.price * (1 + approx.durationOnly));
      withConvexity.push(measures.price * (1 + approx.withConvexity));
    }
    return { yields, exact, durationOnly, withConvexity };
  }, [bond, params.yieldRate, measures]);

  /** How duration and convexity vary with maturity, at a fixed yield. */
  const maturityProfile = useMemo(
    () =>
      [1, 2, 3, 5, 7, 10, 15, 20, 30].map((m) => {
        const r = bondRiskMeasures({ ...bond, maturity: m }, params.yieldRate);
        return { maturity: String(m), duration: r.modifiedDuration, convexity: r.convexity / 10 };
      }),
    [bond, params.yieldRate],
  );

  const curve = useMemo(() => buildYieldCurve(params.curveShape, CURVE_MATURITIES), [params.curveShape]);

  const forwards = useMemo(
    () =>
      curve.slice(1).map((point, i) => ({
        from: curve[i].maturity,
        to: point.maturity,
        spot: point.rate,
        forward: forwardRate(curve[i].rate, curve[i].maturity, point.rate, point.maturity),
      })),
    [curve],
  );

  const curvePrice = useMemo(() => priceFromCurve(bond, curve), [bond, curve]);

  /** Exact reprice after the shock, versus the two approximations. */
  const shock = useMemo(() => {
    const exact = bondPrice(bond, params.yieldRate + params.yieldShock);
    const approx = approximatePriceChange(measures, params.yieldShock);
    return {
      exact,
      exactChange: exact / measures.price - 1,
      durationOnly: approx.durationOnly,
      withConvexity: approx.withConvexity,
      durationError: measures.price * (1 + approx.durationOnly) - exact,
      convexityError: measures.price * (1 + approx.withConvexity) - exact,
    };
  }, [bond, params.yieldRate, params.yieldShock, measures]);

  const config: Record<string, number | string> = { ...params };

  return (
    <LabShell
      lab={lab}
      question="A bond's cash flows are contractual and certain. So why is a bond risky — and how precisely can a single number predict what happens to its price when interest rates move?"
    >
      <ExperimentSection kind="inputs">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="The bond" subtitle="Cash flows are fixed by contract. Only the discount rate is uncertain." />
            <CardBody className="space-y-4">
              <NumberField
                label="Face value"
                value={liveParams.faceValue}
                onChange={(v) => update("faceValue", Math.max(1, v))}
                min={1} step={10} suffix="$"
              />
              <SliderControl
                label="Coupon rate"
                value={liveParams.couponRate}
                min={0} max={0.15} step={0.0025}
                onChange={(v) => update("couponRate", v)}
                format={(v) => percent(v, 2)}
                hint="Set it to 0 for a zero-coupon bond, whose Macaulay duration equals its maturity exactly."
              />
              <SliderControl
                label="Maturity"
                value={liveParams.maturity}
                min={1} max={30} step={0.5}
                onChange={(v) => update("maturity", v)}
                format={(v) => `${v} yr`}
              />
              <SelectField
                label="Coupons per year"
                value={String(liveParams.frequency)}
                options={[
                  { value: "1", label: "Annual" },
                  { value: "2", label: "Semi-annual (market convention)" },
                  { value: "4", label: "Quarterly" },
                  { value: "12", label: "Monthly" },
                ]}
                onChange={(v) => update("frequency", Number(v))}
              />
              <SliderControl
                label="Yield to maturity"
                value={liveParams.yieldRate}
                min={0} max={0.15} step={0.0025}
                onChange={(v) => update("yieldRate", v)}
                format={(v) => percent(v, 2)}
                hint="The single flat rate that discounts the cash flows back to the market price. Set it equal to the coupon and the bond prices at exactly par — the cleanest check that the discounting is right."
              />
              <SliderControl
                label="Yield shock"
                value={liveParams.yieldShock}
                min={-0.03} max={0.03} step={0.0005}
                onChange={(v) => update("yieldShock", v)}
                format={(v) => `${v >= 0 ? "+" : ""}${(v * 10000).toFixed(0)} bp`}
                hint="How far rates move. Push it past ±100bp and watch the duration-only estimate fall away from the true price."
              />
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <Button size="sm" onClick={() => update("yieldRate", liveParams.couponRate)}>
                  Price at par
                </Button>
                <Button size="sm" variant="ghost" onClick={() => update("couponRate", 0)}>
                  Make it a zero
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setParams(FIXED_INCOME_DEFAULTS)}>
                  Reset
                </Button>
              </div>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <MetricGrid>
              <MetricCard
                label="Price"
                value={currency(measures.price, 4)}
                tone={measures.price > params.faceValue ? "positive" : measures.price < params.faceValue ? "negative" : "neutral"}
                footnote={
                  Math.abs(measures.price - params.faceValue) < 0.005
                    ? "At par"
                    : measures.price > params.faceValue
                      ? "Premium — coupon above yield"
                      : "Discount — coupon below yield"
                }
              />
              <MetricCard
                label="Macaulay duration"
                value={`${ratio(measures.macaulayDuration, 3)} yr`}
                hint="The present-value-weighted average time to receive the cash flows. Literally the balance point of the cash flows on a time axis."
              />
              <MetricCard
                label="Modified duration"
                value={ratio(measures.modifiedDuration, 3)}
                hint="Percentage price change per unit of yield. A modified duration of 7 means a 1% rate rise costs roughly 7% of value."
              />
              <MetricCard
                label="Convexity"
                value={ratio(measures.convexity, 2)}
                hint="The second-order term. Positive convexity means the price falls less than duration predicts when rates rise, and gains more when they fall."
              />
              <MetricCard
                label="DV01"
                value={currency(measures.dv01, 5)}
                hint="Dollar value of one basis point — what the price moves for a 0.01% rate change. This is the unit traders actually hedge in."
              />
              <MetricCard label="Current yield" value={percent((params.couponRate * params.faceValue) / measures.price, 3)} />
              <MetricCard label="Cash flows" value={integer(flows.length)} />
              <MetricCard
                label="Price off the curve"
                value={currency(curvePrice, 4)}
                hint="Discounting each cash flow at its own maturity's rate rather than at one flat yield. A sloped curve gives a different answer."
              />
            </MetricGrid>

            <Card>
              <CardHeader
                title="Price against yield, and the duration approximation"
                subtitle="The straight line is the duration-only estimate. Notice which side of the true curve it sits on."
              />
              <CardBody>
                <MultiLineChart
                  series={[
                    { key: "exact", label: "True price", values: priceYieldCurve.exact, color: "var(--series-1)", width: 2.2 },
                    { key: "durationOnly", label: "Duration only (tangent)", values: priceYieldCurve.durationOnly, color: "var(--series-5)", dashed: true },
                    { key: "withConvexity", label: "Duration + convexity", values: priceYieldCurve.withConvexity, color: "var(--series-3)", dashed: true },
                  ]}
                  title="The price-yield relationship"
                  description="The true price-yield curve bends upward, with the duration-only straight-line estimate tangent to it at the current yield and lying strictly below it on both sides. Adding the convexity term pulls the approximation back onto the curve."
                  xLabel="Yield to maturity"
                  yLabel="Price"
                  formatX={(i) => percent(priceYieldCurve.yields[Math.round(i)] ?? 0, 1)}
                  formatY={(v) => `$${v.toFixed(0)}`}
                  height={330}
                  footnote="The duration line lies BELOW the true curve in both directions. That is not an artefact — it is what convexity means, and it is why convexity is something a bondholder wants rather than merely a correction term."
                />
              </CardBody>
            </Card>
          </div>
        </div>
      </ExperimentSection>

      <ExperimentSection kind="model">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Pricing is discounting" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="Bond price"
                equation={"P = \\sum_{t} \\frac{C_t}{\\left(1 + y/f\\right)^{f t}}"}
                description="Every cash flow discounted at the same flat yield, compounded f times a year."
                where={[
                  { symbol: "C_t", meaning: "the cash flow at time t — a coupon, plus the face value at maturity" },
                  { symbol: "y", meaning: "yield to maturity, the single rate that reproduces the market price" },
                  { symbol: "f", meaning: "coupon frequency; 2 is the market convention" },
                ]}
              />
              <Callout tone="accent" title="Why the par identity is the best possible test">
                <p>
                  When the yield equals the coupon rate, the price is exactly the face value — no approximation,
                  no rounding. Set them equal above and the price reads{" "}
                  {currency(bondPrice({ ...bond, couponRate: params.couponRate }, params.couponRate), 6)}.
                </p>
                <p>
                  It works because each coupon is exactly the interest the discount rate demands on the
                  outstanding principal, so nothing accrues or erodes. Any error in the compounding convention
                  breaks it immediately, which makes it a far sharper check than comparing against a published
                  price.
                </p>
              </Callout>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Duration and convexity are derivatives" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="Macaulay duration"
                equation={"D = \\frac{\\sum_t t \\cdot PV(C_t)}{P}"}
                description="The present-value-weighted average time to cash flow. Measured in years."
              />
              <EquationBlock
                label="Modified duration"
                equation={"D_{\\text{mod}} = \\frac{D}{1 + y/f} = -\\frac{1}{P}\\frac{dP}{dy}"}
                description="The division by (1 + y/f) is the chain rule — differentiating the discount factor brings it down."
              />
              <EquationBlock
                label="Second-order price change"
                equation={"\\frac{\\Delta P}{P} \\approx -D_{\\text{mod}}\\,\\Delta y + \\tfrac{1}{2}\\,C\\,(\\Delta y)^2"}
                description="A Taylor expansion of price in yield. Duration is the first derivative; convexity is the second."
              />
              <p className="text-xs leading-relaxed text-ink-muted">
                This is why fixed income feels like calculus rather than probability. There is no randomness in
                the cash flows at all — the entire risk is that the <em>discount rate</em> moves, and duration
                and convexity are simply the first two terms of the Taylor series describing that.
              </p>
            </CardBody>
          </Card>
        </div>

        <ResearchOnly>
          <Card className="mt-4">
            <CardHeader title="Cash flow decomposition" subtitle="Where the duration number comes from." />
            <CardBody>
              <DataTable
                columns={["Time (yr)", "Cash flow", "Discount factor", "Present value", "Weight", "t x weight"]}
                align={["right", "right", "right", "right", "right", "right"]}
                caption="Macaulay duration is the final column summed. It is a weighted average of times, with present values as the weights."
                rows={flows.slice(0, 24).map((flow) => {
                  const df = 1 / (1 + params.yieldRate / params.frequency) ** (params.frequency * flow.time);
                  const pv = flow.amount * df;
                  const w = pv / measures.price;
                  return [
                    ratio(flow.time, 2),
                    currency(flow.amount, 2),
                    fmtNumber(df, 6),
                    currency(pv, 4),
                    percent(w, 3),
                    ratio(flow.time * w, 4),
                  ];
                })}
              />
            </CardBody>
          </Card>
        </ResearchOnly>
      </ExperimentSection>

      <ExperimentSection kind="results" title="What a rate shock actually costs">
        <Card>
          <CardHeader
            title={`A ${params.yieldShock >= 0 ? "+" : ""}${(params.yieldShock * 10000).toFixed(0)} basis point move`}
            subtitle="Exact reprice against the two approximations."
          />
          <CardBody className="space-y-4">
            <MetricGrid className="sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Exact new price"
                value={currency(shock.exact, 4)}
                tone={shock.exactChange >= 0 ? "positive" : "negative"}
                footnote={percent(shock.exactChange, 3)}
              />
              <MetricCard label="Duration estimate" value={percent(shock.durationOnly, 3)} />
              <MetricCard label="With convexity" value={percent(shock.withConvexity, 3)} />
              <MetricCard
                label="Convexity improvement"
                value={currency(Math.abs(shock.durationError) - Math.abs(shock.convexityError), 5)}
                tone="positive"
                footnote="Reduction in absolute error"
              />
            </MetricGrid>

            <FindingBlock
              observation={
                <>
                  A {Math.abs(params.yieldShock * 10000).toFixed(0)}bp{" "}
                  {params.yieldShock >= 0 ? "rise" : "fall"} moves the price from{" "}
                  {currency(measures.price, 4)} to {currency(shock.exact, 4)}, a change of{" "}
                  <strong className="text-ink">{percent(shock.exactChange, 3)}</strong>. Duration alone
                  predicts {percent(shock.durationOnly, 3)} — an error of{" "}
                  {currency(Math.abs(shock.durationError), 5)}. Adding convexity reduces that error to{" "}
                  {currency(Math.abs(shock.convexityError), 5)}.
                </>
              }
              interpretation={
                <>
                  The duration estimate is a tangent line to a convex curve, so it sits below the true price
                  on <em>both</em> sides. When rates rise it overstates the loss; when rates fall it
                  understates the gain. Either way the bondholder does better than duration predicts, which is
                  exactly why positive convexity is something you want to own rather than a nuisance term.
                  The error grows with the square of the move, so it is negligible for 1bp and material for
                  200bp.
                </>
              }
              conclusion={
                <>
                  For small moves, one number — modified duration — captures nearly all of a bond&rsquo;s
                  interest-rate risk. For large moves it does not, and the shortfall is systematically in the
                  holder&rsquo;s favour.
                </>
              }
              limitation={
                <>
                  Both approximations assume a <em>parallel</em> shift: every rate on the curve moving by the
                  same amount. Real curves steepen, flatten and twist, and a portfolio that is duration-neutral
                  to a parallel shift can still lose substantially when the curve changes shape. Hedging that
                  requires key-rate durations rather than a single number. These formulas also assume the cash
                  flows are fixed, which fails for callable bonds and mortgages, where falling rates change the
                  cash flows themselves and convexity can turn negative.
                </>
              }
            />

            <SimpleBarChart
              data={maturityProfile}
              xKey="maturity"
              bars={[
                { key: "duration", label: "Modified duration", color: "var(--series-1)" },
                { key: "convexity", label: "Convexity ÷ 10", color: "var(--series-2)" },
              ]}
              title="Duration and convexity against maturity"
              description="Both rise with maturity, but convexity rises far faster — roughly with the square of maturity while duration rises roughly linearly."
              formatY={(v) => v.toFixed(1)}
              height={260}
              footnote="Convexity is scaled by 1/10 to share an axis. Note it grows much faster than duration, which is why long bonds are far more sensitive to large rate moves than their duration alone suggests."
            />
          </CardBody>
        </Card>
      </ExperimentSection>

      <ExperimentSection kind="simulation" title="The yield curve">
        <Card>
          <CardHeader
            title="Rates are not a single number"
            subtitle="Every maturity has its own rate. The shape carries information."
          />
          <CardBody className="space-y-4">
            <div className="max-w-sm">
              <SelectField
                label="Curve shape"
                value={liveParams.curveShape}
                options={(Object.keys(CURVE_LABELS) as FixedIncomeParams["curveShape"][]).map((s) => ({
                  value: s, label: CURVE_LABELS[s],
                }))}
                onChange={(v) => update("curveShape", v)}
                hint="Generated with the Nelson-Siegel form, the standard parametric description of a yield curve and the one most central banks publish."
              />
            </div>

            <MultiLineChart
              series={[
                { key: "spot", label: "Spot (zero) rates", values: curve.map((p) => p.rate), color: "var(--series-1)", width: 2.2 },
                { key: "forward", label: "Implied 1-period forwards", values: [null, ...forwards.map((f) => f.forward)], color: "var(--series-2)", dashed: true },
              ]}
              title="Spot and forward rates"
              description="Zero-coupon rates by maturity, with the implied forward rates between consecutive maturities drawn alongside. Forwards sit above spots when the curve slopes upward and below when it inverts."
              xLabel="Maturity (years)"
              yLabel="Rate"
              formatX={(i) => `${CURVE_MATURITIES[Math.round(i)] ?? ""}`}
              formatY={(v) => percent(v, 1)}
              height={300}
              footnote="Forward rates are implied by no-arbitrage, not forecast. They are the rates that make investing long equivalent to investing short and rolling — which is a statement about today's prices, not about the future."
            />

            <Callout tone="caution" title="The most common misreading in all of fixed income">
              <p>
                A forward rate is <strong className="text-ink">not</strong> a prediction. It is the rate that
                makes two investment routes equivalent given today&rsquo;s curve: lending for two years must
                equal lending for one and rolling into the forward, or there is a riskless profit.
              </p>
              <p>
                An upward-sloping curve therefore implies forwards above today&rsquo;s spot rates — but that
                is arithmetic, not a forecast that rates will rise. The curve can slope upward purely because
                investors demand a premium for tying money up longer.
              </p>
            </Callout>

            <ResearchOnly>
              <DataTable
                columns={["From (yr)", "To (yr)", "Spot rate", "Implied forward", "Forward − spot"]}
                align={["right", "right", "right", "right", "right"]}
                caption="Forward rates from the no-arbitrage identity (1+y₁)^t₁ (1+f)^(t₂−t₁) = (1+y₂)^t₂."
                rows={forwards.map((f) => [
                  ratio(f.from, 2),
                  ratio(f.to, 2),
                  percent(f.spot, 3),
                  percent(f.forward, 3),
                  <span key={f.to} className={f.forward > f.spot ? "text-positive" : "text-negative"}>
                    {percent(f.forward - f.spot, 3)}
                  </span>,
                ])}
              />
            </ResearchOnly>
          </CardBody>
        </Card>
      </ExperimentSection>

      <ExperimentSection kind="assumptions">
        <Card>
          <CardBody>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[
                { title: "Cash flows are certain", body: "No default, no call, no prepayment. Credit risk is an entirely separate dimension that this model does not represent at all." },
                { title: "A single flat yield", body: "Yield to maturity discounts every cash flow at the same rate, which is only consistent if the curve is flat. The curve pricing above shows the difference." },
                { title: "Parallel curve shifts", body: "Duration and convexity assume every rate moves together. Real curves steepen, flatten and twist." },
                { title: "Reinvestment at the yield", body: "Yield to maturity is only the realised return if every coupon is reinvested at that same yield — which is rarely true." },
                { title: "Continuous divisibility and no frictions", body: "No bid-ask spread, no settlement conventions, no accrued-interest mechanics." },
                { title: "Fixed coupons", body: "Floating-rate notes, inflation-linked bonds and mortgages all break the fixed-cash-flow assumption in different ways." },
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
        <Callout tone="caution" title="What this leaves out">
          <p>
            Credit is the large omission. Every bond here is assumed to pay in full and on time, which turns
            the problem into pure discounting. A corporate or sovereign bond carries default risk, and pricing
            that requires hazard rates, recovery assumptions and credit spreads — a separate body of
            mathematics with its own failure modes.
          </p>
          <p>
            Optionality is the other. Callable bonds, mortgage-backed securities and anything with prepayment
            have cash flows that <em>change</em> when rates move: when rates fall, borrowers refinance and the
            bond is taken away precisely when it would have been most valuable. That produces{" "}
            <strong className="text-ink">negative convexity</strong> — the price gains <em>less</em> than
            duration predicts on a rally — which is the opposite of everything demonstrated above, and it is a
            large part of what rates desks spend their time on.
          </p>
          <p>
            Nothing here is a recommendation about any security. The bond is synthetic and its parameters are
            whatever you typed.
          </p>
        </Callout>
      </ExperimentSection>

      <ReproducibilityPanel
        title="Fixed Income Lab"
        prefix="FI"
        config={config}
        labels={FIXED_INCOME_LABELS}
        basePath="/labs/fixed-income"
        exports={[
          {
            label: "Export cash flows (CSV)",
            filename: `quantverge-bond-${params.maturity}y-${(params.couponRate * 100).toFixed(2)}.csv`,
            mime: "text/csv",
            build: () =>
              toCSV(
                flows.map((f) => {
                  const df = 1 / (1 + params.yieldRate / params.frequency) ** (params.frequency * f.time);
                  return {
                    time_years: f.time.toFixed(4),
                    cash_flow: f.amount.toFixed(6),
                    discount_factor: df.toFixed(10),
                    present_value: (f.amount * df).toFixed(6),
                  };
                }),
              ),
          },
          {
            label: "Export analysis (JSON)",
            filename: `quantverge-bond-${params.maturity}y.json`,
            mime: "application/json",
            build: () =>
              JSON.stringify(
                {
                  experiment: "Fixed Income Lab",
                  bond,
                  yield_to_maturity: params.yieldRate,
                  risk_measures: measures,
                  shock_analysis: { shock_bp: params.yieldShock * 10000, ...shock },
                  yield_curve: { shape: params.curveShape, points: curve, forwards },
                  price_from_curve: curvePrice,
                  note: "Synthetic bond. Assumes no credit risk and no embedded options.",
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
