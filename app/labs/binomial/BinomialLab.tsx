"use client";

import { useMemo, useState } from "react";
import {
  Button, Callout, Card, CardBody, CardHeader, MetricCard, MetricGrid,
  SliderControl, NumberField, SelectField, Toggle, DataTable, ErrorState,
} from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";
import { ExperimentSection, FindingBlock, ResearchOnly } from "@/components/labs/ExperimentSection";
import { LabShell, ReproducibilityPanel } from "@/components/labs/LabShell";
import { MultiLineChart } from "@/components/charts";
import { useDebounced } from "@/lib/hooks/useBatchedSimulation";
import { binomialPrice, convergenceProfile, type BinomialInputs } from "@/lib/finance/binomialTree";
import { blackScholes } from "@/lib/finance/blackScholes";
import { toCSV } from "@/lib/experiment/config";
import { percent, ratio, integer, currency } from "@/lib/format";
import type { LabMeta } from "@/content/labs";
import { BINOMIAL_DEFAULTS, BINOMIAL_LABELS, type BinomialLabParams } from "@/lib/labs/binomial";

export function BinomialLab({ lab, initialParams }: { lab: LabMeta; initialParams: BinomialLabParams }) {
  const [liveParams, setParams] = useState<BinomialLabParams>(initialParams);
  const params = useDebounced(liveParams, 180);

  const update = <K extends keyof BinomialLabParams>(key: K, value: BinomialLabParams[K]) =>
    setParams((previous) => ({ ...previous, [key]: value }));

  const isAmerican = params.american === 1;

  const inputs: BinomialInputs = useMemo(
    () => ({
      spot: params.spot,
      strike: params.strike,
      timeToExpiry: params.timeToExpiry,
      riskFreeRate: params.riskFreeRate,
      volatility: params.volatility,
      dividendYield: params.dividendYield,
      steps: params.steps,
      american: isAmerican,
    }),
    [params, isAmerican],
  );

  const result = useMemo(() => {
    try {
      return { ok: true as const, value: binomialPrice(inputs, params.optionType) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Pricing failed." };
    }
  }, [inputs, params.optionType]);

  const analytic = useMemo(
    () => blackScholes(
      {
        spot: params.spot, strike: params.strike, timeToExpiry: params.timeToExpiry,
        riskFreeRate: params.riskFreeRate, volatility: params.volatility,
        dividendYield: params.dividendYield,
      },
      params.optionType,
    ),
    [params],
  );

  const convergence = useMemo(() => {
    try {
      return convergenceProfile({ ...inputs, american: false }, params.optionType, 120);
    } catch {
      return [];
    }
  }, [inputs, params.optionType]);

  /** Price against spot, American vs European, to show where they separate. */
  const exerciseBoundary = useMemo(() => {
    const spots: number[] = [];
    const american: number[] = [];
    const european: number[] = [];
    const intrinsic: number[] = [];
    const lo = params.strike * 0.4;
    const hi = params.strike * 1.6;
    for (let i = 0; i <= 60; i++) {
      const s = lo + ((hi - lo) * i) / 60;
      spots.push(s);
      try {
        american.push(binomialPrice({ ...inputs, spot: s, steps: Math.min(120, params.steps), american: true }, params.optionType).price);
        european.push(binomialPrice({ ...inputs, spot: s, steps: Math.min(120, params.steps), american: false }, params.optionType).price);
      } catch {
        american.push(NaN);
        european.push(NaN);
      }
      intrinsic.push(
        params.optionType === "call" ? Math.max(0, s - params.strike) : Math.max(0, params.strike - s),
      );
    }
    return { spots, american, european, intrinsic };
  }, [inputs, params.strike, params.optionType, params.steps]);

  const config: Record<string, number | string> = { ...params };

  return (
    <LabShell
      lab={lab}
      question="Black-Scholes gives a closed form for European options. So why build a tree — and what can a tree price that a formula cannot?"
    >
      <ExperimentSection kind="inputs">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Contract and tree" />
            <CardBody className="space-y-4">
              <SelectField
                label="Option type"
                value={liveParams.optionType}
                options={[
                  { value: "put", label: "Put — right to sell at K" },
                  { value: "call", label: "Call — right to buy at K" },
                ]}
                onChange={(v) => update("optionType", v)}
              />
              <Toggle
                label="American exercise"
                checked={isAmerican}
                onChange={(v) => update("american", v ? 1 : 0)}
                hint="American options may be exercised at any time before expiry. This is the case Black-Scholes cannot price, and the reason trees exist."
              />
              <NumberField
                label="Spot price S"
                value={liveParams.spot}
                onChange={(v) => update("spot", Math.max(1, v))}
                min={1} step={5} suffix="$"
              />
              <NumberField
                label="Strike price K"
                value={liveParams.strike}
                onChange={(v) => update("strike", Math.max(1, v))}
                min={1} step={5} suffix="$"
              />
              <SliderControl
                label="Time to expiry"
                value={liveParams.timeToExpiry}
                min={0.08} max={3} step={0.02}
                onChange={(v) => update("timeToExpiry", v)}
                format={(v) => `${v.toFixed(2)} yr`}
              />
              <SliderControl
                label="Volatility"
                value={liveParams.volatility}
                min={0.05} max={0.8} step={0.01}
                onChange={(v) => update("volatility", v)}
                format={(v) => percent(v, 0)}
              />
              <SliderControl
                label="Risk-free rate"
                value={liveParams.riskFreeRate}
                min={0} max={0.2} step={0.0025}
                onChange={(v) => update("riskFreeRate", v)}
                format={(v) => percent(v, 2)}
                hint="Raise this with an American put: higher rates make the interest earned on the freed-up strike more valuable, so early exercise becomes attractive sooner."
              />
              <SliderControl
                label="Dividend yield"
                value={liveParams.dividendYield}
                min={0} max={0.2} step={0.0025}
                onChange={(v) => update("dividendYield", v)}
                format={(v) => percent(v, 2)}
                hint="With zero dividends an American call is never worth exercising early. Raise this and that changes."
              />
              <SliderControl
                label="Tree steps"
                value={liveParams.steps}
                min={1} max={500} step={1}
                onChange={(v) => update("steps", v)}
                format={(v) => integer(v)}
                hint="More steps means a finer approximation. Watch the convergence chart — it does not improve smoothly."
              />
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <Button size="sm" onClick={() => setParams({ ...BINOMIAL_DEFAULTS, optionType: "put", american: 1, spot: 75 })}>
                  Deep ITM American put
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setParams(BINOMIAL_DEFAULTS)}>
                  Reset
                </Button>
              </div>
            </CardBody>
          </Card>

          <div className="space-y-4">
            {!result.ok ? (
              <ErrorState
                title="This tree is too coarse to be arbitrage-free"
                description={result.message}
                onRetry={() => update("steps", Math.max(50, params.steps * 4))}
              />
            ) : (
              <>
                <MetricGrid>
                  <MetricCard
                    label={`${isAmerican ? "American" : "European"} price`}
                    value={currency(result.value.price, 5)}
                  />
                  <MetricCard
                    label="Black-Scholes price"
                    value={currency(analytic.price, 5)}
                    hint="The closed form, which prices European exercise only."
                  />
                  <MetricCard
                    label={isAmerican ? "Early-exercise premium" : "Tree − Black-Scholes"}
                    value={currency(isAmerican ? result.value.earlyExercisePremium : result.value.price - analytic.price, 5)}
                    tone={isAmerican && result.value.earlyExercisePremium > 0.001 ? "positive" : "neutral"}
                    hint={isAmerican
                      ? "What the right to exercise early is worth. Zero means the right is never used."
                      : "Pure discretisation error. It should shrink as steps increase."}
                  />
                  <MetricCard
                    label="Risk-neutral probability p"
                    value={ratio(result.value.riskNeutralProbability, 5)}
                    hint="Not the real probability of an up move, and independent of the stock's expected return."
                  />
                  <MetricCard label="Up factor u" value={ratio(result.value.up, 5)} />
                  <MetricCard label="Down factor d" value={ratio(result.value.down, 5)} footnote={`u × d = ${ratio(result.value.up * result.value.down, 6)}`} />
                  <MetricCard label="Delta" value={ratio(result.value.delta, 5)} />
                  <MetricCard
                    label="Early exercise optimal from"
                    value={
                      result.value.earliestExerciseTime === null
                        ? "Never"
                        : `${ratio(result.value.earliestExerciseTime, 3)} yr`
                    }
                    tone={result.value.earliestExerciseTime === null ? "neutral" : "caution"}
                  />
                </MetricGrid>

                <Card>
                  <CardHeader
                    title="American against European across spot prices"
                    subtitle="Where the two separate is where the right to exercise early starts to be worth something."
                  />
                  <CardBody>
                    <MultiLineChart
                      series={[
                        { key: "amer", label: "American", values: exerciseBoundary.american, color: "var(--series-1)", width: 2.2 },
                        { key: "euro", label: "European", values: exerciseBoundary.european, color: "var(--series-2)", dashed: true, width: 1.8 },
                        { key: "intr", label: "Intrinsic value", values: exerciseBoundary.intrinsic, color: "var(--ink-faint)", dashed: true },
                      ]}
                      title="American vs European value"
                      description="Two option-value curves against spot price. For a put they separate when deep in the money, with the American line sitting above the European one and hugging the intrinsic-value line."
                      xLabel="Spot price"
                      yLabel="Option value"
                      formatX={(i) => `$${exerciseBoundary.spots[Math.round(i)]?.toFixed(0) ?? ""}`}
                      formatY={(v) => `$${v.toFixed(1)}`}
                      height={320}
                      footnote={
                        params.optionType === "put"
                          ? "For a put, the American line pulls away from the European one deep in the money, where it tracks intrinsic value. That region is where exercising immediately beats holding."
                          : "For a call with no dividends the two lines coincide exactly — early exercise is never optimal. Raise the dividend yield and watch them separate."
                      }
                    />
                  </CardBody>
                </Card>
              </>
            )}
          </div>
        </div>
      </ExperimentSection>

      <ExperimentSection kind="model">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="The Cox-Ross-Rubinstein tree" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="Up and down moves"
                equation={"u = e^{\\sigma\\sqrt{\\Delta t}}, \\qquad d = \\frac{1}{u}"}
                description="Choosing d = 1/u makes the tree RECOMBINE: up-then-down lands exactly where down-then-up does."
              />
              <p className="text-xs leading-relaxed text-ink-muted">
                That recombination is what makes the method practical. Without it an n-step tree has{" "}
                <InlineMath>{"2^n"}</InlineMath> terminal nodes — for n = 100 that is more nodes than there are
                atoms in the observable universe. With it, there are{" "}
                <InlineMath>{"n+1"}</InlineMath>, and your {integer(params.steps)}-step tree has just{" "}
                {integer(((params.steps + 1) * (params.steps + 2)) / 2)} nodes in total.
              </p>
              <EquationBlock
                label="Risk-neutral probability"
                equation={"p = \\frac{e^{(r-q)\\Delta t} - d}{u - d}"}
                description="The probability that makes the discounted expected stock price equal today's price."
              />
              <Callout tone="accent" title="The stock's expected return is absent">
                <p>
                  Look at what is in <InlineMath>{"p"}</InlineMath>: volatility, rates, dividends, time. Not{" "}
                  <InlineMath>{"\\mu"}</InlineMath>. Two people who disagree completely about whether the stock
                  will rise must still agree on the option&rsquo;s price.
                </p>
                <p>
                  The tree makes the reason visible in a way the Black-Scholes formula does not. At every
                  single node you can replicate the option&rsquo;s next-period payoff with shares and cash, and
                  the cost of that replicating portfolio is the price. Replication never requires knowing
                  which way the stock will go.
                </p>
              </Callout>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Backward induction, and the American decision" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="European: hold to expiry"
                equation={"V_{i,j} = e^{-r\\Delta t}\\left[p\\,V_{i+1,j+1} + (1-p)\\,V_{i+1,j}\\right]"}
                description="Work backwards from the payoff at expiry, discounting the risk-neutral expectation at each node."
              />
              <EquationBlock
                label="American: hold or exercise"
                equation={"V_{i,j} = \\max\\Big(\\underbrace{\\text{payoff}(S_{i,j})}_{\\text{exercise now}},\; \\underbrace{e^{-r\\Delta t}\\left[p V_{i+1,j+1} + (1-p) V_{i+1,j}\\right]}_{\\text{keep holding}}\\Big)"}
                description="One extra max() at every node. That is the entire difference, and it is why no closed form exists."
              />
              <p className="text-xs leading-relaxed text-ink-muted">
                The American value depends on an optimal stopping decision at every node, and that decision
                depends on the value function it is helping to define. There is no formula to solve for; you
                have to compute it. That single <InlineMath>{"\\max"}</InlineMath> is why this lab exists
                alongside the Options Lab.
              </p>
            </CardBody>
          </Card>
        </div>
      </ExperimentSection>

      <ExperimentSection kind="results" title="Convergence to Black-Scholes">
        <Card>
          <CardHeader
            title="European price against step count"
            subtitle="Watch how it approaches the analytic value — it is not a smooth approach."
          />
          <CardBody className="space-y-4">
            {convergence.length > 0 ? (
              <MultiLineChart
                series={[
                  { key: "tree", label: "Binomial price", values: convergence.map((c) => c.binomial), color: "var(--series-1)", width: 1.6 },
                  { key: "bs", label: "Black-Scholes", values: convergence.map((c) => c.blackScholes), color: "var(--series-2)", dashed: true, width: 1.8 },
                ]}
                title="Convergence"
                description="The binomial price oscillating around the Black-Scholes value with an amplitude that shrinks as the number of steps grows, rather than approaching smoothly from one side."
                xLabel="Tree steps"
                yLabel="Price"
                formatX={(i) => integer(convergence[Math.round(i)]?.steps ?? 0)}
                formatY={(v) => `$${v.toFixed(3)}`}
                height={300}
                footnote="The oscillation is real and well known: odd and even step counts converge from opposite sides, because whether a tree node lands exactly on the strike changes how the payoff kink is resolved. Practitioners average adjacent step counts to cancel it."
              />
            ) : null}

            {result.ok ? (
              <FindingBlock
                observation={
                  <>
                    {isAmerican ? (
                      <>
                        The American {params.optionType} prices at {currency(result.value.price, 5)} against{" "}
                        {currency(analytic.price, 5)} for the European equivalent — an early-exercise premium of{" "}
                        <strong className="text-ink">{currency(result.value.earlyExercisePremium, 5)}</strong>.
                        Early exercise {result.value.earliestExerciseTime === null
                          ? "is never optimal anywhere in the tree"
                          : `first becomes optimal at ${ratio(result.value.earliestExerciseTime, 3)} years`}.
                      </>
                    ) : (
                      <>
                        A {integer(params.steps)}-step tree prices the European {params.optionType} at{" "}
                        {currency(result.value.price, 5)} against the analytic {currency(analytic.price, 5)} —
                        a difference of {currency(result.value.price - analytic.price, 5)}.
                      </>
                    )}
                  </>
                }
                interpretation={
                  params.optionType === "call" && params.dividendYield < 0.001 && isAmerican ? (
                    <>
                      <p>
                        The premium is zero, and that is a theorem rather than an accident. Exercising a call
                        early means paying the strike sooner than necessary and giving up the remaining time
                        value, with nothing gained — the stock pays no dividend, so holding it offers no
                        benefit over holding the option.
                      </p>
                      <p className="mt-2">
                        So an American call on a non-dividend stock is worth exactly its European twin, and
                        Black-Scholes prices it correctly. Raise the dividend yield above about the rate and
                        watch the premium appear: now holding the stock pays something, and capturing it can
                        beat holding the option.
                      </p>
                    </>
                  ) : isAmerican && params.optionType === "put" ? (
                    <>
                      <p>
                        Puts are the interesting case. Exercising a deep in-the-money put hands you the strike
                        in cash <em>now</em>, which then earns interest. Holding the option instead means
                        waiting for money you could already have. Once the option is deep enough in the money
                        that the remaining time value is less than the interest on the strike, exercising wins.
                      </p>
                      <p className="mt-2">
                        That is why the premium rises with the interest rate and with how deep in the money the
                        option is — and why it falls to nothing when rates are zero, since there is then no
                        interest to earn.
                      </p>
                    </>
                  ) : (
                    <>
                      The tree is a discretisation of the same risk-neutral expectation Black-Scholes computes
                      exactly, so the gap is pure approximation error. It shrinks roughly as 1/n, but
                      non-monotonically — the oscillation above means a single step count can be unluckily
                      placed.
                    </>
                  )
                }
                conclusion={
                  <>
                    The tree earns its keep not by being more accurate than the formula — it is less accurate —
                    but by being able to price contracts the formula cannot express at all.
                  </>
                }
                limitation={
                  <>
                    The tree inherits every Black-Scholes assumption: constant volatility, no jumps, frictionless
                    continuous trading. It relaxes exactly one thing, the exercise decision. It is also slow
                    relative to a formula, and extending it to several underlying assets is impractical — node
                    count grows exponentially in dimension, which is where Monte Carlo takes over.
                  </>
                }
              />
            ) : null}

            <ResearchOnly>
              {convergence.length > 0 ? (
                <DataTable
                  columns={["Steps", "Binomial", "Black-Scholes", "Error", "Error sign"]}
                  align={["right", "right", "right", "right", "left"]}
                  caption="Note the sign column alternating — that is the odd/even oscillation, not noise."
                  rows={convergence.slice(0, 24).map((c) => [
                    integer(c.steps),
                    currency(c.binomial, 6),
                    currency(c.blackScholes, 6),
                    currency(c.error, 6),
                    <span key={c.steps} className={c.error > 0 ? "text-positive" : "text-negative"}>
                      {c.error > 0 ? "above" : "below"}
                    </span>,
                  ])}
                />
              ) : null}
            </ResearchOnly>
          </CardBody>
        </Card>
      </ExperimentSection>

      <ExperimentSection kind="assumptions">
        <Card>
          <CardBody>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[
                { title: "Two outcomes per step", body: "The stock either multiplies by u or by d. Real prices take any value, but as the step shrinks the binomial distribution converges to the log-normal." },
                { title: "Constant volatility", body: "u and d are fixed throughout the tree, so volatility cannot change. The GARCH lab exists because that assumption is false." },
                { title: "No arbitrage", body: "The requirement d < e^((r−q)Δt) < u. Violate it and p falls outside [0,1]; this lab refuses to price rather than returning a meaningless number." },
                { title: "Frictionless replication", body: "Continuous rebalancing at no cost, as in Black-Scholes." },
                { title: "Known constant rates", body: "r and q are fixed and certain for the option's life." },
                { title: "Optimal exercise", body: "The American price assumes the holder always exercises optimally. A real holder exercising late or early is worth less." },
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
        <Callout tone="caution" title="A different tool, not a better one">
          <p>
            For a European option the tree is strictly worse than the formula: slower, less accurate, and
            converging in an annoying oscillating fashion. Its value is entirely in the problems the formula
            cannot state — early exercise, and by extension barriers, Bermudan schedules and other
            path-sensitive features.
          </p>
          <p>
            It also does not escape the modelling assumptions. Constant volatility, no jumps and costless
            hedging are all still here. The tree relaxes exactly one thing — when you are allowed to exercise
            — and inherits everything else. Beyond two or three underlying assets the node count explodes and
            Monte Carlo becomes the only practical method.
          </p>
          <p>
            Nothing here is advice about trading options. Options are leveraged instruments where a buyer can
            lose the whole premium and a seller can lose far more than they received.
          </p>
        </Callout>
      </ExperimentSection>

      <ReproducibilityPanel
        title="Binomial Tree Lab"
        prefix="BIN"
        config={config}
        labels={BINOMIAL_LABELS}
        basePath="/labs/binomial"
        exports={
          convergence.length > 0
            ? [
                {
                  label: "Export convergence (CSV)",
                  filename: `quantverge-binomial-${params.optionType}.csv`,
                  mime: "text/csv",
                  build: () =>
                    toCSV(
                      convergence.map((c) => ({
                        steps: c.steps,
                        binomial_price: c.binomial.toFixed(8),
                        black_scholes: c.blackScholes.toFixed(8),
                        error: c.error.toFixed(10),
                      })),
                    ),
                },
                {
                  label: "Export pricing (JSON)",
                  filename: `quantverge-binomial-${params.optionType}.json`,
                  mime: "application/json",
                  build: () =>
                    JSON.stringify(
                      {
                        experiment: "Binomial Tree Lab",
                        parameters: config,
                        tree: result.ok ? result.value : { error: result.message },
                        black_scholes: { price: analytic.price, greeks: analytic.greeks },
                        note: "Cox-Ross-Rubinstein recombining tree. American values assume optimal exercise.",
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
