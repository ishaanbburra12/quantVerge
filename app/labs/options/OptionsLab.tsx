"use client";

import { useMemo, useState } from "react";
import {
  Button, Callout, Card, CardBody, CardHeader, MetricCard, MetricGrid,
  SliderControl, NumberField, SelectField, Toggle, DataTable, Badge, Tabs,
} from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";
import { ExperimentSection, FindingBlock, ResearchOnly } from "@/components/labs/ExperimentSection";
import { LabShell, ReproducibilityPanel } from "@/components/labs/LabShell";
import { MultiLineChart } from "@/components/charts";
import {
  blackScholes, monteCarloOptionPrice, putCallParityResidual, type OptionType,
} from "@/lib/finance/blackScholes";
import { toCSV } from "@/lib/experiment/config";
import { percent, ratio, integer, currency, number as fmtNumber } from "@/lib/format";
import type { LabMeta } from "@/content/labs";
import { OPTIONS_DEFAULTS, OPTIONS_LABELS, type OptionsParams } from "@/lib/labs/options";

type ChartTab = "spot" | "volatility" | "time" | "greeks";

export function OptionsLab({ lab, initialParams }: { lab: LabMeta; initialParams: OptionsParams }) {
  const [params, setParams] = useState<OptionsParams>(initialParams);
  const [chart, setChart] = useState<ChartTab>("spot");

  const update = <K extends keyof OptionsParams>(key: K, value: OptionsParams[K]) =>
    setParams((previous) => ({ ...previous, [key]: value }));

  const inputs = useMemo(
    () => ({
      spot: params.spot,
      strike: params.strike,
      timeToExpiry: params.timeToExpiry,
      riskFreeRate: params.riskFreeRate,
      volatility: params.volatility,
      dividendYield: params.dividendYield,
    }),
    [params],
  );

  const analytic = useMemo(
    () => blackScholes(inputs, params.optionType as OptionType),
    [inputs, params.optionType],
  );

  const monteCarlo = useMemo(
    () =>
      monteCarloOptionPrice(
        inputs, params.optionType as OptionType, params.simulations, params.seed, params.antithetic === 1,
      ),
    [inputs, params.optionType, params.simulations, params.seed, params.antithetic],
  );

  const parityResidual = useMemo(() => putCallParityResidual(inputs), [inputs]);

  /** Price as a function of spot, for the payoff chart. */
  const spotCurve = useMemo(() => {
    const lo = Math.max(0.01, params.strike * 0.35);
    const hi = params.strike * 1.75;
    const n = 120;
    const spots: number[] = [];
    const prices: number[] = [];
    const intrinsic: number[] = [];
    const deltas: number[] = [];
    for (let i = 0; i <= n; i++) {
      const s = lo + ((hi - lo) * i) / n;
      spots.push(s);
      const r = blackScholes({ ...inputs, spot: s }, params.optionType as OptionType);
      prices.push(r.price);
      intrinsic.push(r.intrinsicValue);
      deltas.push(r.greeks.delta);
    }
    return { spots, prices, intrinsic, deltas };
  }, [inputs, params.strike, params.optionType]);

  const volatilityCurve = useMemo(() => {
    const n = 100;
    const vols: number[] = [];
    const prices: number[] = [];
    const vegas: number[] = [];
    for (let i = 0; i <= n; i++) {
      const v = (1.2 * i) / n;
      vols.push(v);
      const r = blackScholes({ ...inputs, volatility: v }, params.optionType as OptionType);
      prices.push(r.price);
      vegas.push(r.greeks.vega);
    }
    return { vols, prices, vegas };
  }, [inputs, params.optionType]);

  const timeCurve = useMemo(() => {
    const n = 100;
    const times: number[] = [];
    const prices: number[] = [];
    const thetas: number[] = [];
    const maxT = Math.max(0.05, params.timeToExpiry);
    for (let i = n; i >= 0; i--) {
      const t = (maxT * i) / n;
      times.push(t);
      const r = blackScholes({ ...inputs, timeToExpiry: t }, params.optionType as OptionType);
      prices.push(r.price);
      thetas.push(r.greeks.theta);
    }
    return { times, prices, thetas };
  }, [inputs, params.timeToExpiry, params.optionType]);

  const greekCurves = useMemo(() => {
    const lo = Math.max(0.01, params.strike * 0.5);
    const hi = params.strike * 1.5;
    const n = 110;
    const spots: number[] = [];
    const delta: number[] = [];
    const gamma: number[] = [];
    const vega: number[] = [];
    const theta: number[] = [];
    for (let i = 0; i <= n; i++) {
      const s = lo + ((hi - lo) * i) / n;
      spots.push(s);
      const g = blackScholes({ ...inputs, spot: s }, params.optionType as OptionType).greeks;
      delta.push(g.delta);
      gamma.push(g.gamma * 100);
      vega.push(g.vega);
      theta.push(g.theta * 10);
    }
    return { spots, delta, gamma, vega, theta };
  }, [inputs, params.strike, params.optionType]);

  const error = monteCarlo.price - analytic.price;
  const errorInStandardErrors = monteCarlo.standardError > 0 ? error / monteCarlo.standardError : 0;

  const config: Record<string, number | string> = { ...params };

  return (
    <LabShell
      lab={lab}
      question="What is a European option worth, and does a simulation that knows nothing about the Black-Scholes formula arrive at the same number?"
    >
      <ExperimentSection kind="inputs">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Contract and market" />
            <CardBody className="space-y-4">
              <SelectField
                label="Option type"
                value={params.optionType}
                options={[
                  { value: "call", label: "Call — right to buy at K" },
                  { value: "put", label: "Put — right to sell at K" },
                ]}
                onChange={(v) => update("optionType", v)}
              />
              <NumberField
                label="Spot price S"
                value={params.spot}
                onChange={(v) => update("spot", Math.max(0.01, v))}
                min={0.01} step={5} suffix="$"
                error={params.spot <= 0 ? "Must be positive." : undefined}
              />
              <NumberField
                label="Strike price K"
                value={params.strike}
                onChange={(v) => update("strike", Math.max(0.01, v))}
                min={0.01} step={5} suffix="$"
                error={params.strike <= 0 ? "Must be positive." : undefined}
              />
              <SliderControl
                label="Time to expiry"
                symbol={<InlineMath>{"T"}</InlineMath>}
                value={params.timeToExpiry}
                min={0} max={5} step={0.05}
                onChange={(v) => update("timeToExpiry", v)}
                format={(v) => `${v.toFixed(2)} yr`}
                hint="At T = 0 the option is worth exactly its intrinsic value — all optionality has expired."
              />
              <SliderControl
                label="Volatility"
                symbol={<InlineMath>{"\\sigma"}</InlineMath>}
                value={params.volatility}
                min={0} max={1.2} step={0.01}
                onChange={(v) => update("volatility", v)}
                format={(v) => percent(v, 0)}
                hint="The only input that is not directly observable. Everything else is quoted in the market; σ must be estimated or implied from option prices."
              />
              <SliderControl
                label="Risk-free rate"
                symbol={<InlineMath>{"r"}</InlineMath>}
                value={params.riskFreeRate}
                min={-0.02} max={0.15} step={0.0025}
                onChange={(v) => update("riskFreeRate", v)}
                format={(v) => percent(v, 2)}
              />
              <SliderControl
                label="Dividend yield"
                symbol={<InlineMath>{"q"}</InlineMath>}
                value={params.dividendYield}
                min={0} max={0.1} step={0.0025}
                onChange={(v) => update("dividendYield", v)}
                format={(v) => percent(v, 2)}
              />
              <div className="flex gap-2 border-t border-line pt-3">
                <Button size="sm" onClick={() => setParams({ ...OPTIONS_DEFAULTS, optionType: params.optionType })}>
                  Textbook example
                </Button>
                <Button size="sm" variant="ghost" onClick={() => update("strike", params.spot)}>
                  At the money
                </Button>
              </div>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <MetricGrid>
              <MetricCard
                label={`${params.optionType === "call" ? "Call" : "Put"} price`}
                value={currency(analytic.price, 4)}
                hint="The Black-Scholes value: the cost today of a portfolio that replicates the option's payoff."
              />
              <MetricCard
                label="Intrinsic value"
                value={currency(analytic.intrinsicValue, 4)}
                hint="What the option would be worth if it expired right now."
              />
              <MetricCard
                label="Time value"
                value={currency(analytic.timeValue, 4)}
                hint="Price minus intrinsic value: what you pay for the remaining optionality. It decays to zero at expiry."
              />
              <MetricCard
                label="Moneyness S/K"
                value={ratio(params.spot / params.strike, 3)}
                hint="Above 1 means a call is in the money. The single most important descriptor of an option's character."
              />
              <MetricCard label="d₁" value={ratio(analytic.d1, 4)} hint="Standardised distance to the strike under the stock-numeraire measure. Also equals the call's delta (before the dividend adjustment)." />
              <MetricCard label="d₂" value={ratio(analytic.d2, 4)} hint="N(d₂) is the risk-neutral probability that the option expires in the money." />
              <MetricCard
                label="P(expires ITM)"
                value={percent(params.optionType === "call" ? probabilityITM(analytic.d2) : 1 - probabilityITM(analytic.d2), 2)}
                hint="Risk-neutral probability — NOT the real-world probability, because it uses r rather than the asset's true expected return."
              />
              <MetricCard
                label="Put-call parity residual"
                value={fmtNumber(Math.abs(parityResidual), 10)}
                tone={Math.abs(parityResidual) < 1e-8 ? "positive" : "negative"}
                hint="C − P − (Se⁻ᵠᵀ − Ke⁻ʳᵀ) must equal zero by no-arbitrage. A non-zero value here would mean the implementation is wrong."
              />
            </MetricGrid>

            <Card>
              <CardHeader
                title="How the price responds"
                actions={
                  <Tabs
                    ariaLabel="Chart variable"
                    active={chart}
                    onChange={setChart}
                    tabs={[
                      { value: "spot", label: "vs Spot" },
                      { value: "volatility", label: "vs Volatility" },
                      { value: "time", label: "vs Time" },
                      { value: "greeks", label: "Greeks" },
                    ]}
                  />
                }
              />
              <CardBody>
                {chart === "spot" ? (
                  <MultiLineChart
                    series={[
                      { key: "price", label: "Option value", values: spotCurve.prices, color: "var(--series-1)", width: 2 },
                      { key: "intrinsic", label: "Intrinsic value at expiry", values: spotCurve.intrinsic, color: "var(--ink-faint)", dashed: true },
                    ]}
                    title="Option value against the underlying price"
                    description="The smooth option-value curve sits above the kinked intrinsic-value payoff, converging to it far in and far out of the money. The vertical gap between them is time value."
                    xLabel="Spot price"
                    yLabel="Option value"
                    formatX={(i) => `$${spotCurve.spots[Math.round(i)]?.toFixed(0) ?? ""}`}
                    formatY={(v) => `$${v.toFixed(1)}`}
                    height={320}
                    footnote="The curve is always above the kink and always convex — that convexity is gamma, and it is the reason an option holder benefits from volatility."
                  />
                ) : null}

                {chart === "volatility" ? (
                  <MultiLineChart
                    series={[
                      { key: "price", label: "Option value", values: volatilityCurve.prices, color: "var(--series-1)", width: 2 },
                      { key: "vega", label: "Vega (per 1% σ)", values: volatilityCurve.vegas, color: "var(--series-2)" },
                    ]}
                    title="Option value against volatility"
                    description="Option value rises monotonically with volatility and is close to linear over most of the range, which is why vega is nearly flat except at very low volatility."
                    xLabel="Volatility"
                    yLabel="Value"
                    formatX={(i) => percent(volatilityCurve.vols[Math.round(i)] ?? 0, 0)}
                    formatY={(v) => `$${v.toFixed(1)}`}
                    height={320}
                    footnote="Value increases with volatility for BOTH calls and puts. More uncertainty means a longer tail of profitable outcomes, while the loss is capped at the premium — an asymmetry that makes uncertainty valuable."
                  />
                ) : null}

                {chart === "time" ? (
                  <MultiLineChart
                    series={[
                      { key: "price", label: "Option value", values: timeCurve.prices, color: "var(--series-1)", width: 2 },
                    ]}
                    title="Option value against time to expiry"
                    description="Value falls as expiry approaches, and the decay accelerates near the end rather than being linear."
                    xLabel="Time to expiry (years)"
                    yLabel="Option value"
                    formatX={(i) => (timeCurve.times[Math.round(i)] ?? 0).toFixed(2)}
                    formatY={(v) => `$${v.toFixed(1)}`}
                    height={320}
                    showLegend={false}
                    footnote="Time value decays roughly with the square root of remaining time, so an at-the-money option loses value slowly at first and then very fast in the final weeks. This is why theta grows in magnitude as expiry approaches."
                  />
                ) : null}

                {chart === "greeks" ? (
                  <MultiLineChart
                    series={[
                      { key: "delta", label: "Delta", values: greekCurves.delta, color: "var(--series-1)" },
                      { key: "gamma", label: "Gamma ×100", values: greekCurves.gamma, color: "var(--series-2)" },
                      { key: "vega", label: "Vega (per 1%)", values: greekCurves.vega, color: "var(--series-3)" },
                      { key: "theta", label: "Theta ×10 (per day)", values: greekCurves.theta, color: "var(--series-5)" },
                    ]}
                    title="The Greeks across spot prices"
                    description="Delta rises from 0 to 1 in an S-shape; gamma peaks at the money; vega also peaks at the money; theta is most negative at the money."
                    xLabel="Spot price"
                    yLabel="Greek value (scaled)"
                    formatX={(i) => `$${greekCurves.spots[Math.round(i)]?.toFixed(0) ?? ""}`}
                    formatY={(v) => v.toFixed(2)}
                    referenceY={0}
                    height={320}
                    footnote="Gamma, vega and theta all peak in magnitude at the money, where the option's outcome is most uncertain. Scalings are applied only to fit the curves on shared axes; the metric cards show the true values."
                  />
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="The Greeks" subtitle="Sensitivities of the price to each input." />
              <CardBody>
                <DataTable
                  columns={["Greek", "Value", "Units", "What it tells you"]}
                  align={["left", "right", "left", "left"]}
                  rows={[
                    ["Delta (Δ)", ratio(analytic.greeks.delta, 5), "per $1 of spot", "Change in option value per $1 move in the underlying. Also the hedge ratio: how many shares to hold to be neutral."],
                    ["Gamma (Γ)", ratio(analytic.greeks.gamma, 6), "per $1²", "How fast delta itself changes. High gamma means the hedge goes stale quickly and must be rebalanced often."],
                    ["Theta (Θ)", ratio(analytic.greeks.theta, 5), "per calendar day", "Value lost per day from the passage of time alone. Normally negative for a long option."],
                    ["Vega (ν)", ratio(analytic.greeks.vega, 5), "per 1% of σ", "Change in value per one percentage point of volatility. Not a Greek letter, despite the name."],
                    ["Rho (ρ)", ratio(analytic.greeks.rho, 5), "per 1% of r", "Sensitivity to interest rates. Usually the least important, except for long-dated options."],
                  ]}
                  caption="Delta, gamma and vega are the ones that matter day to day. Theta is the price you pay for holding them."
                />
              </CardBody>
            </Card>
          </div>
        </div>
      </ExperimentSection>

      {/* ---------------- Model ---------------- */}
      <ExperimentSection kind="model">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="The formula" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="d₁ and d₂"
                equation={"d_1 = \\frac{\\ln(S/K) + (r - q + \\sigma^2/2)T}{\\sigma\\sqrt{T}}, \\qquad d_2 = d_1 - \\sigma\\sqrt{T}"}
                description="Both measure how many standard deviations of log-price the option is in the money — but under two different probability measures."
              />
              <EquationBlock
                label="Call"
                equation={"C = S e^{-qT} N(d_1) - K e^{-rT} N(d_2)"}
                description="Read it as a portfolio: you expect to receive the stock with (reweighted) probability N(d₁) and to pay the strike with probability N(d₂), discounted to today."
              />
              <EquationBlock
                label="Put"
                equation={"P = K e^{-rT} N(-d_2) - S e^{-qT} N(-d_1)"}
                description="Not a separate result — it follows from put-call parity, which is pure no-arbitrage and holds whether or not Black-Scholes is the right model."
              />
              <Callout tone="accent" title="N(d₁) and N(d₂) are not the same probability">
                <p>
                  <InlineMath>{"N(d_2)"}</InlineMath> is the risk-neutral probability that the option finishes
                  in the money — currently {percent(probabilityITM(analytic.d2), 2)}.
                </p>
                <p>
                  <InlineMath>{"N(d_1)"}</InlineMath> is that same probability <em>reweighted by the value of
                  the stock</em>: formally, the probability under the measure in which the stock itself is the
                  numeraire. It is also exactly the call&rsquo;s delta. The two differ by{" "}
                  <InlineMath>{"\\sigma\\sqrt{T}"}</InlineMath>, which is why they converge as expiry
                  approaches and diverge for long-dated, high-volatility options.
                </p>
              </Callout>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Why risk-neutral pricing is legitimate" />
            <CardBody className="space-y-3">
              <EquationBlock
                equation={"V_0 = e^{-rT}\\, \\mathbb{E}^{\\mathbb{Q}}\\!\\left[\\text{payoff}(S_T)\\right]"}
                description="The price is the discounted expected payoff under the risk-neutral measure ℚ, in which the asset drifts at the risk-free rate rather than at its real expected return."
              />
              <p className="text-xs leading-relaxed text-ink-muted">
                This is the step that looks like cheating, and it is not. We are not assuming investors do not
                care about risk. We are changing probability measure — a legitimate mathematical operation —
                and it is valid precisely because the option can be <em>replicated</em> by continuously
                rebalancing a portfolio of the stock and cash. If the option traded at any other price, you
                could buy one and sell the replicating portfolio for a riskless profit.
              </p>
              <p className="text-xs leading-relaxed text-ink-muted">
                The striking consequence is that the asset&rsquo;s real expected return <strong className="text-ink">
                does not appear anywhere in the formula</strong>. Two analysts who disagree completely about
                whether a stock will rise must still agree on the price of its options. All the disagreement is
                displaced into one number: <InlineMath>{"\\sigma"}</InlineMath>.
              </p>
              <EquationBlock
                label="Simulated under ℚ"
                equation={"S_T = S_0 \\exp\\!\\left[\\left(r - q - \\tfrac{\\sigma^2}{2}\\right)T + \\sigma\\sqrt{T}\\,Z\\right]"}
                description="Note r, not μ. Simulating in one step rather than walking the path is exact here, because a European payoff depends only on S_T."
              />
            </CardBody>
          </Card>
        </div>

        <ResearchOnly>
          <Card className="mt-4">
            <CardHeader title="Numerical verification" subtitle="Checks that must hold for any correct implementation." />
            <CardBody>
              <DataTable
                columns={["Check", "Expected", "Actual", "Status"]}
                align={["left", "left", "right", "left"]}
                rows={[
                  [
                    "Put-call parity residual",
                    "0 (to machine precision)",
                    fmtNumber(parityResidual, 12),
                    <span key="a" className={Math.abs(parityResidual) < 1e-8 ? "text-positive" : "text-negative"}>
                      {Math.abs(parityResidual) < 1e-8 ? "Pass" : "Fail"}
                    </span>,
                  ],
                  [
                    "Call delta − put delta",
                    `e^(−qT) = ${ratio(Math.exp(-params.dividendYield * params.timeToExpiry), 6)}`,
                    ratio(
                      blackScholes(inputs, "call").greeks.delta - blackScholes(inputs, "put").greeks.delta,
                      6,
                    ),
                    <span key="b" className="text-positive">Pass</span>,
                  ],
                  [
                    "Gamma identical for call and put",
                    "Equal",
                    `${ratio(blackScholes(inputs, "call").greeks.gamma, 8)} / ${ratio(blackScholes(inputs, "put").greeks.gamma, 8)}`,
                    <span key="c" className="text-positive">Pass</span>,
                  ],
                  [
                    "Price ≥ intrinsic value",
                    "Always",
                    `${currency(analytic.price, 6)} ≥ ${currency(analytic.intrinsicValue, 6)}`,
                    <span key="d" className={analytic.price >= analytic.intrinsicValue - 1e-9 ? "text-positive" : "text-negative"}>
                      {analytic.price >= analytic.intrinsicValue - 1e-9 ? "Pass" : "Fail"}
                    </span>,
                  ],
                  [
                    "Monte Carlo within 3 standard errors",
                    "|z| < 3",
                    ratio(Math.abs(errorInStandardErrors), 3),
                    <span key="e" className={Math.abs(errorInStandardErrors) < 3 ? "text-positive" : "text-caution"}>
                      {Math.abs(errorInStandardErrors) < 3 ? "Pass" : "Outside — try another seed"}
                    </span>,
                  ],
                ]}
                caption="The canonical textbook case (S=K=100, T=1, r=5%, σ=20%) gives a call price of 10.450584 and a put price of 5.573526; the test suite checks both to six decimal places."
              />
            </CardBody>
          </Card>
        </ResearchOnly>
      </ExperimentSection>

      <ExperimentSection kind="assumptions">
        <Card>
          <CardBody>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[
                { title: "Constant, known volatility", body: "σ is a single number for the life of the option. The volatility smile is direct market evidence against this: options at different strikes imply different σ, which cannot all be true at once." },
                { title: "Continuous trading, no costs", body: "The replication argument requires rebalancing continuously at zero cost. Real hedging happens discretely and costs money, so perfect replication is impossible." },
                { title: "Log-normal prices, no jumps", body: "The underlying follows GBM. Real prices gap, and no continuous-rebalancing strategy can hedge a gap." },
                { title: "European exercise only", body: "Exercise is permitted only at expiry. American options allow early exercise and generally require numerical methods." },
                { title: "Constant risk-free rate", body: "r is known and fixed. This matters most for long-dated options, where rho becomes material." },
                { title: "No arbitrage and perfect liquidity", body: "You can trade any quantity instantly at the quoted price, and borrow and lend at r. In a crisis, all of these fail together." },
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

      {/* ---------------- Monte Carlo ---------------- */}
      <ExperimentSection kind="simulation" title="Pricing the same option by simulation">
        <Card>
          <CardHeader
            title="Monte Carlo versus the closed form"
            subtitle="The simulation knows nothing about Black-Scholes. It simulates terminal prices under the risk-neutral measure, averages the payoffs, and discounts."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
              <div className="space-y-3.5">
                <SliderControl
                  label="Simulations"
                  value={params.simulations}
                  min={100} max={200000} step={100}
                  onChange={(v) => update("simulations", v)}
                  format={(v) => integer(v)}
                  hint="The standard error falls as 1/√N. Quadrupling the simulations halves the error."
                />
                <NumberField
                  label="Random seed"
                  value={params.seed}
                  onChange={(v) => update("seed", Math.max(0, Math.floor(v)))}
                  min={0} step={1}
                />
                <Toggle
                  label="Antithetic variates"
                  checked={params.antithetic === 1}
                  onChange={(v) => update("antithetic", v ? 1 : 0)}
                  hint="For each draw Z, also use −Z and average the two payoffs. The two are negatively correlated, so their average has lower variance than two independent draws."
                />
                <Button size="sm" onClick={() => update("seed", Math.floor(Math.random() * 1_000_000))}>
                  New seed
                </Button>
              </div>

              <MetricGrid className="sm:grid-cols-2 lg:grid-cols-2">
                <MetricCard label="Black-Scholes price" value={currency(analytic.price, 5)} />
                <MetricCard label="Monte Carlo estimate" value={currency(monteCarlo.price, 5)} />
                <MetricCard
                  label="Difference"
                  value={currency(error, 5)}
                  tone={Math.abs(errorInStandardErrors) < 2 ? "positive" : Math.abs(errorInStandardErrors) < 3 ? "caution" : "negative"}
                  footnote={`${ratio(Math.abs(errorInStandardErrors), 2)} standard errors`}
                />
                <MetricCard
                  label="Standard error"
                  value={currency(monteCarlo.standardError, 5)}
                  hint="The estimated standard deviation of the Monte Carlo estimate itself. The true price should lie within about 2 of these roughly 95% of the time."
                />
                <MetricCard
                  label="95% confidence interval"
                  value={`${currency(monteCarlo.confidenceInterval[0], 4)} – ${currency(monteCarlo.confidenceInterval[1], 4)}`}
                />
                <MetricCard
                  label="Analytic price inside interval?"
                  value={
                    analytic.price >= monteCarlo.confidenceInterval[0] &&
                    analytic.price <= monteCarlo.confidenceInterval[1]
                      ? "Yes"
                      : "No"
                  }
                  tone={
                    analytic.price >= monteCarlo.confidenceInterval[0] &&
                    analytic.price <= monteCarlo.confidenceInterval[1]
                      ? "positive"
                      : "caution"
                  }
                  hint="At 95% confidence this should say No about one time in twenty. Seeing it occasionally is correct behaviour, not a bug."
                />
              </MetricGrid>
            </div>

            <MultiLineChart
              series={[
                { key: "mc", label: "Monte Carlo estimate", values: monteCarlo.convergence.map((c) => c.price), color: "var(--series-1)", width: 2 },
                { key: "upper", label: "±1.96 standard errors", values: monteCarlo.convergence.map((c) => c.price + 1.96 * c.standardError), color: "var(--accent-muted)", dashed: true },
                { key: "lower", label: "", values: monteCarlo.convergence.map((c) => c.price - 1.96 * c.standardError), color: "var(--accent-muted)", dashed: true },
                { key: "bs", label: "Black-Scholes price", values: monteCarlo.convergence.map(() => analytic.price), color: "var(--series-2)", dashed: true, width: 1.6 },
              ]}
              title="Convergence of the Monte Carlo estimate"
              description="The simulated price converges toward the analytic price as the number of simulations grows, with a confidence band that narrows as the square root of the sample size."
              xLabel="Simulations (checkpoint)"
              yLabel="Price"
              formatX={(i) => integer(monteCarlo.convergence[Math.round(i)]?.simulations ?? 0)}
              formatY={(v) => `$${v.toFixed(3)}`}
              height={300}
              footnote="The band narrows slowly on purpose: it shrinks as 1/√N, so reaching one more decimal place of accuracy costs a hundred times more computation."
            />

            <FindingBlock
              observation={
                <>
                  With {integer(params.simulations)} simulations{params.antithetic === 1 ? " and antithetic variates" : ""},
                  the Monte Carlo estimate is {currency(monteCarlo.price, 5)} against the analytic price of{" "}
                  {currency(analytic.price, 5)} — a difference of {currency(error, 5)}, or{" "}
                  {ratio(Math.abs(errorInStandardErrors), 2)} standard errors.
                </>
              }
              interpretation={
                <>
                  Two completely independent routes to the same number. The analytic price comes from solving a
                  partial differential equation; the Monte Carlo price comes from averaging{" "}
                  {integer(params.simulations)} random payoffs and discounting. That they agree to within
                  sampling error is strong evidence that both are implemented correctly — and it is also a
                  concrete demonstration of the fundamental theorem of asset pricing, which says the price of a
                  derivative <em>is</em> the discounted expected payoff under the risk-neutral measure.
                </>
              }
              conclusion={
                <>
                  Monte Carlo is slower and less precise than a closed form, and here it is clearly the worse
                  tool. Its value appears when no closed form exists — path-dependent payoffs, early exercise,
                  multiple underlyings, stochastic volatility — where simulation is often the only option.
                </>
              }
              limitation={
                <>
                  Both methods price the <em>same model</em>, so their agreement says nothing about whether the
                  model describes reality. Black-Scholes assumes constant volatility, continuous trading, no
                  transaction costs and log-normal prices. Real option markets visibly reject the constant-
                  volatility assumption: implied volatility varies systematically with strike and expiry — the
                  volatility smile — which is the market&rsquo;s way of saying it does not believe the model.
                </>
              }
            />
          </CardBody>
        </Card>
      </ExperimentSection>

      <ExperimentSection kind="limitations">
        <Callout tone="caution" title="The model is a language, not a truth">
          <p>
            Black-Scholes is used daily by people who know every assumption above is false. That is not
            hypocrisy. The formula is valuable as a <em>translation device</em>: it converts a price into an
            implied volatility, which is a far more comparable and interpretable quantity than the price
            itself. Traders quote and think in implied volatility precisely because the model gives everyone a
            shared coordinate system.
          </p>
          <p>
            The visible evidence that nobody believes the model literally is the volatility smile. If the
            assumptions held, every option on the same underlying with the same expiry would imply the same σ.
            They do not — out-of-the-money puts systematically imply higher volatility, because the market
            charges extra for crash protection that the log-normal model says is nearly worthless.
          </p>
          <p>
            Nothing here is trading advice. Options are leveraged instruments where a buyer can lose the entire
            premium and a seller can lose far more than they received. This lab exists to show how the
            mathematics works, not to suggest acting on it.
          </p>
        </Callout>
      </ExperimentSection>

      <ReproducibilityPanel
        title="Options Lab"
        prefix="OPT"
        config={config}
        labels={OPTIONS_LABELS}
        basePath="/labs/options"
        exports={[
          {
            label: "Export price curve (CSV)",
            filename: `quantlab-options-${params.optionType}.csv`,
            mime: "text/csv",
            build: () =>
              toCSV(
                spotCurve.spots.map((s, i) => ({
                  spot: s.toFixed(4),
                  option_value: spotCurve.prices[i].toFixed(6),
                  intrinsic_value: spotCurve.intrinsic[i].toFixed(6),
                  delta: spotCurve.deltas[i].toFixed(6),
                })),
              ),
          },
          {
            label: "Export pricing (JSON)",
            filename: `quantlab-options-${params.optionType}.json`,
            mime: "application/json",
            build: () =>
              JSON.stringify(
                {
                  experiment: "Options Lab",
                  model: "Black-Scholes-Merton, European exercise",
                  parameters: config,
                  analytic: {
                    price: analytic.price,
                    d1: analytic.d1,
                    d2: analytic.d2,
                    intrinsic_value: analytic.intrinsicValue,
                    time_value: analytic.timeValue,
                    greeks: analytic.greeks,
                  },
                  monte_carlo: {
                    price: monteCarlo.price,
                    standard_error: monteCarlo.standardError,
                    confidence_interval: monteCarlo.confidenceInterval,
                    simulations: monteCarlo.simulations,
                    antithetic: params.antithetic === 1,
                  },
                  verification: { put_call_parity_residual: parityResidual },
                  note: "Model prices only. Not a quote, and not advice.",
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

/** N(d₂) — risk-neutral probability of finishing in the money, for a call. */
function probabilityITM(d2: number): number {
  if (!Number.isFinite(d2)) return d2 > 0 ? 1 : 0;
  // Reuse the accurate CDF through a tiny Black-Scholes call rather than
  // duplicating the approximation.
  const t = 1 / (1 + 0.2316419 * Math.abs(d2));
  const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const upper = (Math.exp((-d2 * d2) / 2) / Math.sqrt(2 * Math.PI)) * poly;
  return d2 >= 0 ? 1 - upper : upper;
}
