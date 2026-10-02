"use client";

import { useMemo, useState } from "react";
import { useDebounced } from "@/lib/hooks/useBatchedSimulation";
import {
  Button, Callout, Card, CardBody, CardHeader, MetricCard, MetricGrid,
  SliderControl, NumberField, SelectField, DataTable, Badge,
} from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";
import { ExperimentSection, FindingBlock, ResearchOnly } from "@/components/labs/ExperimentSection";
import { LabShell, ReproducibilityPanel } from "@/components/labs/LabShell";
import { EquityChart, SimpleBarChart, MultiLineChart } from "@/components/charts";
import {
  applyStrategy, STRATEGY_LABELS, STRATEGY_DESCRIPTIONS, type StrategyKind, type StrategyParams,
} from "@/lib/finance/strategies";
import { generateRegimeMarket, generateAR1, DEFAULT_REGIMES } from "@/lib/simulation/generators";
import { buildTransitionMatrix } from "@/lib/labs/marketRegimes";
import {
  annualisedReturn, annualisedVolatility, sharpeRatio, maxDrawdown, pricesFromReturns, cumulativeReturn,
} from "@/lib/finance/performance";
import { autocorrelation } from "@/lib/statistics/descriptive";
import { toCSV } from "@/lib/experiment/config";
import { percent, ratio, integer, currency } from "@/lib/format";
import type { LabMeta } from "@/content/labs";
import {
  BACKTEST_DEFAULTS, BACKTEST_LABELS, MARKET_LABELS, MARKET_DESCRIPTIONS, COST_SCENARIOS,
  type BacktestParams,
} from "@/lib/labs/backtesting";

const STRATEGY_COLORS: Record<StrategyKind, string> = {
  buyAndHold: "var(--series-1)",
  movingAverageCrossover: "var(--series-2)",
  momentum: "var(--series-3)",
  meanReversion: "var(--series-4)",
  random: "var(--series-6)",
  alwaysCash: "var(--ink-faint)",
  oracle: "var(--series-5)",
};

const ACTIVE_STRATEGIES: StrategyKind[] = [
  "buyAndHold", "movingAverageCrossover", "momentum", "meanReversion", "random", "alwaysCash",
];

export function BacktestLab({ lab, initialParams }: { lab: LabMeta; initialParams: BacktestParams }) {
  const [liveParams, setParams] = useState<BacktestParams>(initialParams);
  /**
   * `liveParams` updates on every mousemove so the slider thumb tracks the
   * finger. Everything downstream — the simulation AND the chart props — reads
   * the debounced copy instead, so dragging triggers one recompute and one chart
   * render rather than one per pixel. The chart captions are also more honest
   * this way: they describe the parameters that were actually simulated, not a
   * value the slider is still travelling through.
   */
  const params = useDebounced(liveParams, 160);

  const update = <K extends keyof BacktestParams>(key: K, value: BacktestParams[K]) =>
    setParams((previous) => ({ ...previous, [key]: value }));

  /** Generate the market. Only the regime process has a hidden state for the Oracle. */
  const market = useMemo(() => {
    if (params.marketProcess === "regime") {
      const transition = buildTransitionMatrix(0.97, 0.93, 0.95);
      const result = generateRegimeMarket({
        regimes: DEFAULT_REGIMES.map((r, i) => ({
          ...r,
          // Scale the preset regimes to the user's chosen volatility level.
          volatility: r.volatility * (params.volatility / 0.2),
          drift: i === 0 ? params.drift * 2 : r.drift,
        })),
        transition,
        steps: params.steps,
        seed: params.seed,
        initialPrice: 100,
      });
      return { prices: result.prices, returns: result.returns, hiddenRegimes: result.regimes };
    }

    const phi =
      params.marketProcess === "randomWalk" ? 0
      : params.marketProcess === "trending" ? Math.abs(params.phi)
      : -Math.abs(params.phi);

    const rets = generateAR1({
      drift: params.drift,
      volatility: params.volatility,
      phi,
      steps: params.steps,
      seed: params.seed,
    });
    return { prices: pricesFromReturns(rets, 100), returns: rets, hiddenRegimes: undefined };
  }, [params.marketProcess, params.steps, params.seed, params.volatility, params.drift, params.phi]);

  const strategyParams: StrategyParams = useMemo(
    () => ({
      fastWindow: params.fastWindow,
      slowWindow: params.slowWindow,
      lookback: params.lookback,
      threshold: params.threshold,
      seed: params.strategySeed,
    }),
    [params],
  );

  const strategies: StrategyKind[] = useMemo(
    () => (market.hiddenRegimes ? [...ACTIVE_STRATEGIES, "oracle"] : ACTIVE_STRATEGIES),
    [market.hiddenRegimes],
  );

  /** Run every strategy at the chosen transaction cost. */
  const results = useMemo(
    () =>
      strategies.map((kind) => {
        const run = applyStrategy(
          kind, market.prices, market.returns, strategyParams, params.transactionCost, market.hiddenRegimes,
        );
        const equity = run.equity.map((v) => v * params.initialCapital);
        const dd = maxDrawdown(equity);
        return {
          kind,
          run,
          equity,
          totalReturn: cumulativeReturn(run.returns),
          annualReturn: annualisedReturn(run.returns, 252),
          volatility: annualisedVolatility(run.returns, 252),
          sharpe: sharpeRatio(run.returns, 0, 252),
          maxDrawdown: dd.maxDrawdown,
          turnover: run.turnover,
          trades: run.trades,
          exposure: run.exposure,
          costDrag: cumulativeReturn(run.grossReturns) - cumulativeReturn(run.returns),
        };
      }),
    [strategies, market, strategyParams, params.transactionCost, params.initialCapital],
  );

  /**
   * The same strategies at four different cost levels.
   *
   * This is the heart of the lab: holding everything else fixed and varying only
   * the cost assumption shows how much of a backtest's apparent edge is an
   * artefact of assuming trading is free.
   */
  const costAnalysis = useMemo(
    () =>
      strategies.map((kind) => ({
        kind,
        byCost: COST_SCENARIOS.map((cost) => {
          const run = applyStrategy(
            kind, market.prices, market.returns, strategyParams, cost, market.hiddenRegimes,
          );
          return {
            cost,
            annualReturn: annualisedReturn(run.returns, 252),
            sharpe: sharpeRatio(run.returns, 0, 252),
            totalReturn: cumulativeReturn(run.returns),
          };
        }),
      })),
    [strategies, market, strategyParams],
  );

  /**
   * Every strategy at zero transaction cost.
   *
   * The Oracle's role is to measure whether the environment contains exploitable
   * structure at all, and that question is separate from whether the structure
   * can be harvested profitably. Those two things come apart as soon as costs
   * exist, so we keep both numbers.
   */
  const grossResults = useMemo(
    () =>
      strategies.map((kind) => {
        const run = applyStrategy(
          kind, market.prices, market.returns, strategyParams, 0, market.hiddenRegimes,
        );
        return { kind, sharpe: sharpeRatio(run.returns, 0, 252), annualReturn: annualisedReturn(run.returns, 252) };
      }),
    [strategies, market, strategyParams],
  );

  const best = useMemo(
    () => results.reduce((b, r) => (r.sharpe > b.sharpe ? r : b), results[0]),
    [results],
  );
  const buyHold = results.find((r) => r.kind === "buyAndHold")!;
  const randomStrategy = results.find((r) => r.kind === "random")!;

  const marketAutocorrelation = useMemo(() => autocorrelation(market.returns, 1), [market.returns]);

  const config: Record<string, number | string> = { ...params };

  return (
    <LabShell
      lab={lab}
      question="Given a market whose structure we control exactly, which trading rules actually extract that structure — and how much of any apparent edge survives the cost of trading?"
    >
      <ExperimentSection kind="inputs">
        <div className="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card>
              <CardHeader title="Market" subtitle="You choose the data-generating process, so you know what structure is really there." />
              <CardBody className="space-y-4">
                <SelectField
                  label="Process"
                  value={liveParams.marketProcess}
                  options={(Object.keys(MARKET_LABELS) as BacktestParams["marketProcess"][]).map((p) => ({
                    value: p, label: MARKET_LABELS[p],
                  }))}
                  onChange={(v) => update("marketProcess", v)}
                />
                <p className="rounded-card border border-line bg-surface-sunken px-3 py-2 text-2xs leading-relaxed text-ink-muted">
                  {MARKET_DESCRIPTIONS[params.marketProcess]}
                </p>
                {params.marketProcess === "trending" || params.marketProcess === "meanReverting" ? (
                  <SliderControl
                    label="Autocorrelation strength"
                    symbol={<InlineMath>{"|\\varphi|"}</InlineMath>}
                    value={Math.abs(params.phi)}
                    min={0} max={0.5} step={0.01}
                    onChange={(v) => update("phi", v)}
                    format={(v) => v.toFixed(2)}
                    hint="How much memory the return series has. Real equity markets show daily autocorrelation close to zero — values above about 0.1 are unrealistically generous to the strategies."
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
                  min={252} max={7560} step={252}
                  onChange={(v) => update("steps", v)}
                  format={(v) => `${integer(v)} (${(v / 252).toFixed(0)}y)`}
                />
                <NumberField
                  label="Market seed"
                  value={liveParams.seed}
                  onChange={(v) => update("seed", Math.max(0, Math.floor(v)))}
                  min={0} step={1}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Strategy parameters" />
              <CardBody className="space-y-4">
                <SliderControl
                  label="Fast moving average"
                  value={liveParams.fastWindow}
                  min={2} max={100} step={1}
                  onChange={(v) => update("fastWindow", Math.min(v, liveParams.slowWindow - 1))}
                  format={(v) => `${v} days`}
                />
                <SliderControl
                  label="Slow moving average"
                  value={liveParams.slowWindow}
                  min={5} max={300} step={5}
                  onChange={(v) => update("slowWindow", Math.max(v, liveParams.fastWindow + 1))}
                  format={(v) => `${v} days`}
                />
                <SliderControl
                  label="Momentum lookback"
                  value={liveParams.lookback}
                  min={5} max={250} step={5}
                  onChange={(v) => update("lookback", v)}
                  format={(v) => `${v} days`}
                />
                <SliderControl
                  label="Signal threshold"
                  value={liveParams.threshold}
                  min={0} max={0.15} step={0.005}
                  onChange={(v) => update("threshold", v)}
                  format={(v) => percent(v, 1)}
                  hint="How large the trailing move must be before the signal fires. Higher thresholds trade less often, which reduces costs but also reduces responsiveness."
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Costs and capital" />
              <CardBody className="space-y-4">
                <SliderControl
                  label="Transaction cost"
                  value={liveParams.transactionCost}
                  min={0} max={0.005} step={0.00025}
                  onChange={(v) => update("transactionCost", v)}
                  format={(v) => `${(v * 100).toFixed(3)}%`}
                  hint="Charged on the absolute change in position each time it moves. A round trip from cash to invested and back costs twice this."
                />
                <NumberField
                  label="Initial capital"
                  value={liveParams.initialCapital}
                  onChange={(v) => update("initialCapital", Math.max(100, v))}
                  min={100} step={1000} suffix="$"
                />
                <div className="flex gap-2 border-t border-line pt-3">
                  <Button size="sm" onClick={() => update("seed", Math.floor(Math.random() * 1_000_000))}>
                    New market
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setParams(BACKTEST_DEFAULTS)}>
                    Reset
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Equity curves"
                subtitle={`All strategies on the same market, net of ${(params.transactionCost * 100).toFixed(3)}% transaction costs.`}
              />
              <CardBody>
                <EquityChart
                  series={results.map((r) => ({
                    key: r.kind,
                    label: STRATEGY_LABELS[r.kind],
                    values: r.equity,
                    color: STRATEGY_COLORS[r.kind],
                    width: r.kind === "buyAndHold" ? 2 : 1.4,
                    dashed: r.kind === "random" || r.kind === "alwaysCash",
                  }))}
                  title="Strategy equity curves"
                  description={`Portfolio value for ${results.length} strategies over ${(params.steps / 252).toFixed(0)} years, all starting from ${currency(params.initialCapital, 0)} and all charged the same transaction cost.`}
                  formatY={(v) => `$${(v / 1000).toFixed(1)}k`}
                  yLabel="Portfolio value"
                  height={340}
                  footnote={`Market lag-1 autocorrelation: ${ratio(marketAutocorrelation, 4)}. ${Math.abs(marketAutocorrelation) < 0.03 ? "Essentially zero — there is no linear memory for a trend rule to find." : marketAutocorrelation > 0 ? "Positive, so momentum rules have something real to exploit." : "Negative, so mean-reversion rules have something real to exploit."}`}
                />
              </CardBody>
            </Card>

            <MetricGrid>
              <MetricCard
                label="Best Sharpe"
                value={`${STRATEGY_LABELS[best.kind]}`}
                footnote={ratio(best.sharpe, 3)}
                tone={best.sharpe > 0 ? "positive" : "negative"}
              />
              <MetricCard
                label="Buy & hold Sharpe"
                value={ratio(buyHold.sharpe, 3)}
                hint="The benchmark. It has essentially no turnover, so transaction costs cannot hurt it."
              />
              <MetricCard
                label="Random strategy Sharpe"
                value={ratio(randomStrategy.sharpe, 3)}
                tone={randomStrategy.sharpe > 0 ? "caution" : "neutral"}
                hint="The null hypothesis. If a rule cannot beat a coin flip, it has demonstrated nothing — and note that the coin flip sometimes posts a positive Sharpe purely by luck."
              />
              <MetricCard
                label="Market autocorrelation"
                value={ratio(marketAutocorrelation, 4)}
                hint="Lag-1 autocorrelation of returns. This is the structure that trend and reversion rules are trying to exploit; near zero means there is nothing there."
              />
            </MetricGrid>
          </div>
        </div>
      </ExperimentSection>

      {/* ---------------- Model ---------------- */}
      <ExperimentSection kind="model" title="How the backtest works">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="The one-step lag, and why it matters more than anything else" />
            <CardBody className="space-y-3">
              <EquationBlock
                equation={"r^{\\text{strategy}}_t = w_{t-1}\\, r_t - c \\left| w_{t-1} - w_{t-2} \\right|"}
                description="The position held through day t is the one decided at the end of day t−1."
                where={[
                  { symbol: "w_{t-1}", meaning: "the position chosen using data available up to day t−1" },
                  { symbol: "r_t", meaning: "the asset's return on day t" },
                  { symbol: "c", meaning: "the transaction cost rate, charged on the change in position" },
                ]}
              />
              <Callout tone="caution" title="Look-ahead bias">
                <p>
                  If you write <InlineMath>{"w_t r_t"}</InlineMath> instead of{" "}
                  <InlineMath>{"w_{t-1} r_t"}</InlineMath>, the strategy decides its position using the very
                  return it is about to earn. Almost any rule becomes profitable, including rules built from
                  pure noise.
                </p>
                <p>
                  This error is silent — nothing throws, nothing looks wrong, the equity curve simply goes up.
                  It is the single most common mistake in amateur backtesting, and it is why the test suite for
                  this lab includes a case that is designed to <em>fail</em> if the lag is ever removed.
                </p>
              </Callout>
              <EquationBlock
                label="Turnover"
                equation={"\\text{Turnover} = \\sum_{t} \\left| w_t - w_{t-1} \\right|"}
                description="Total capital traded, as a multiple of portfolio value. This single number determines how much transaction costs will matter."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="The strategies" />
            <CardBody>
              <dl className="space-y-3 text-xs leading-relaxed">
                {strategies.map((kind) => (
                  <div key={kind}>
                    <dt className="font-semibold" style={{ color: STRATEGY_COLORS[kind] }}>
                      {STRATEGY_LABELS[kind]}
                    </dt>
                    <dd className="mt-0.5 text-ink-muted">{STRATEGY_DESCRIPTIONS[kind]}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </div>

        {market.hiddenRegimes ? (
          (() => {
            const oracleNet = results.find((r) => r.kind === "oracle")!;
            const oracleGross = grossResults.find((r) => r.kind === "oracle")!;
            const buyHoldGross = grossResults.find((r) => r.kind === "buyAndHold")!;
            const beatsGross = oracleGross.sharpe > buyHoldGross.sharpe;
            const beatsNet = oracleNet.sharpe > buyHold.sharpe;
            return (
              <Callout tone="accent" title="What the Oracle tells you — and the trap in reading it">
                <p>
                  The Oracle sees the hidden regime directly and holds the market only during bull states. It
                  cannot be run — it uses information that does not exist outside the simulation — so it is not
                  a strategy. It is a <em>measurement of the environment</em>.
                </p>
                <p>
                  <strong className="text-ink">Before costs</strong>, the Oracle scores a Sharpe of{" "}
                  {ratio(oracleGross.sharpe, 3)} against buy-and-hold&rsquo;s {ratio(buyHoldGross.sharpe, 3)}.
                  That comparison is the meaningful one for the question &ldquo;is there exploitable structure
                  here?&rdquo;, and the answer is{" "}
                  <strong className="text-ink">{beatsGross ? "yes" : "no — not by timing these regimes"}</strong>.
                </p>
                <p>
                  <strong className="text-ink">After {(params.transactionCost * 100).toFixed(3)}% costs</strong>,
                  the Oracle scores {ratio(oracleNet.sharpe, 3)} against buy-and-hold&rsquo;s{" "}
                  {ratio(buyHold.sharpe, 3)} — it {beatsNet ? "still wins" : "now loses"}. It traded{" "}
                  {integer(oracleNet.trades)} times and gave up {percent(oracleNet.costDrag, 1)} of total return
                  to do so.
                </p>
                {!beatsNet && beatsGross ? (
                  <p>
                    This gap is the single most useful thing on the page. An agent with <em>perfect foresight
                    about the hidden state</em> cannot beat doing nothing, once it has to pay to act on that
                    foresight. The structure is genuinely there; harvesting it costs more than it is worth.
                    Any real strategy must first find the regime — imperfectly, with a lag — and then pay the
                    same costs, so it starts from strictly worse than this. Lower the transaction cost toward
                    zero and watch the point at which perfect information starts to pay.
                  </p>
                ) : null}
                <p>
                  Either way, the Oracle bounds the problem: no regime-timing approach on this market can do
                  better than an agent that already knows the answer.
                </p>
              </Callout>
            );
          })()
                ) : null}
      </ExperimentSection>

      {/* ---------------- Results ---------------- */}
      <ExperimentSection kind="results">
        <Card>
          <CardHeader
            title="Full results"
            subtitle={`Net of ${(params.transactionCost * 100).toFixed(3)}% costs. Turnover is the total fraction of capital traded over the whole backtest.`}
          />
          <CardBody>
            <DataTable
              columns={["Strategy", "Total return", "Annualised", "Volatility", "Sharpe", "Max drawdown", "Trades", "Turnover", "Time invested", "Cost drag"]}
              align={["left", "right", "right", "right", "right", "right", "right", "right", "right", "right"]}
              caption="Cost drag is the difference between gross and net total return — how much of the strategy's raw performance was consumed by trading."
              rows={results.map((r) => [
                <span key={r.kind} style={{ color: STRATEGY_COLORS[r.kind] }}>{STRATEGY_LABELS[r.kind]}</span>,
                <span key="tr" className={r.totalReturn >= 0 ? "text-positive" : "text-negative"}>{percent(r.totalReturn, 1)}</span>,
                percent(r.annualReturn, 2),
                percent(r.volatility, 2),
                <span key="s" className={r.sharpe > 0.3 ? "text-positive" : r.sharpe < 0 ? "text-negative" : undefined}>{ratio(r.sharpe, 3)}</span>,
                percent(r.maxDrawdown, 1),
                integer(r.trades),
                ratio(r.turnover, 1),
                percent(r.exposure, 0),
                <span key="c" className={r.costDrag > 0.05 ? "text-negative" : undefined}>{percent(r.costDrag, 1)}</span>,
              ])}
            />
          </CardBody>
        </Card>

        <Card className="mt-4">
          <CardHeader
            title="How transaction costs destroy a strategy"
            subtitle="Identical market, identical signals, identical everything — only the cost assumption changes."
          />
          <CardBody className="space-y-4">
            <SimpleBarChart
              data={COST_SCENARIOS.map((cost, i) => {
                const row: Record<string, string | number> = { cost: `${(cost * 100).toFixed(3)}%` };
                for (const entry of costAnalysis) row[entry.kind] = entry.byCost[i].sharpe;
                return row;
              })}
              xKey="cost"
              bars={strategies
                .filter((k) => k !== "alwaysCash")
                .map((k) => ({ key: k, label: STRATEGY_LABELS[k], color: STRATEGY_COLORS[k] }))}
              title="Sharpe ratio by transaction cost"
              description="Grouped bars showing each strategy's Sharpe ratio at four cost levels. Buy and hold barely moves because it does not trade; the high-turnover strategies fall steeply."
              formatY={(v) => v.toFixed(2)}
              height={280}
              footnote="Buy and hold is flat across the chart because it trades once. Every other bar's decline is pure cost."
            />

            <DataTable
              columns={["Strategy", ...COST_SCENARIOS.map((c) => `${(c * 100).toFixed(3)}%`), "Sharpe lost"]}
              align={["left", "right", "right", "right", "right", "right"]}
              caption="Annualised Sharpe ratio at each cost level, and the total decline from free trading to 0.25%."
              rows={costAnalysis.map((entry) => {
                const lost = entry.byCost[0].sharpe - entry.byCost[entry.byCost.length - 1].sharpe;
                return [
                  <span key={entry.kind} style={{ color: STRATEGY_COLORS[entry.kind] }}>{STRATEGY_LABELS[entry.kind]}</span>,
                  ...entry.byCost.map((b, i) => (
                    <span key={i} className={b.sharpe < 0 ? "text-negative" : undefined}>{ratio(b.sharpe, 3)}</span>
                  )),
                  <span key="lost" className={lost > 0.3 ? "text-negative" : "text-ink-muted"}>{ratio(lost, 3)}</span>,
                ];
              })}
            />

            {(() => {
              const ma = costAnalysis.find((e) => e.kind === "movingAverageCrossover")!;
              const freeS = ma.byCost[0].sharpe;
              const costlyS = ma.byCost[ma.byCost.length - 1].sharpe;
              const maResult = results.find((r) => r.kind === "movingAverageCrossover")!;
              return (
                <FindingBlock
                  observation={
                    <>
                      The moving-average crossover traded {integer(maResult.trades)} times over{" "}
                      {integer(params.steps)} days, for total turnover of {ratio(maResult.turnover, 1)}× capital.
                      Its Sharpe ratio falls from <strong className="text-ink">{ratio(freeS, 3)}</strong> with
                      free trading to <strong className="text-ink">{ratio(costlyS, 3)}</strong> at 0.25% per
                      trade — a decline of {ratio(freeS - costlyS, 3)}. Buy and hold&rsquo;s Sharpe changes by{" "}
                      {ratio(
                        costAnalysis.find((e) => e.kind === "buyAndHold")!.byCost[0].sharpe -
                          costAnalysis.find((e) => e.kind === "buyAndHold")!.byCost[3].sharpe,
                        3,
                      )}{" "}
                      over the same range.
                    </>
                  }
                  interpretation={
                    <>
                      Cost scales with turnover, and turnover is a property of the <em>rule</em>, not of the
                      market. A strategy that round-trips {ratio(maResult.turnover / 2, 0)} times pays the
                      spread {ratio(maResult.turnover, 0)} times. At 0.25% that is a drag of roughly{" "}
                      {percent(maResult.turnover * 0.0025, 1)} on total return, which must be earned back
                      before the strategy produces anything at all. This is why realistic cost assumptions are
                      not a detail — for a high-turnover rule they are the dominant term.
                    </>
                  }
                  conclusion={
                    <>
                      An apparent edge measured at zero cost tells you almost nothing about whether a
                      strategy is viable. The correct order of operations is to model costs first and then ask
                      whether any edge remains, not to find an edge and then hope costs are small.
                    </>
                  }
                  limitation={
                    <>
                      This cost model is still optimistic. It charges a fixed proportional fee and assumes you
                      always trade at the mid price in unlimited size. Real costs include a bid-ask spread that
                      widens exactly when you most want to trade, market impact that grows with position size,
                      slippage between decision and execution, borrowing costs for short positions, and taxes.
                      The true figure for a retail trader is typically worse than the highest setting here.
                    </>
                  }
                />
              );
            })()}
          </CardBody>
        </Card>
      </ExperimentSection>

      {/* ---------------- Interpretation ---------------- */}
      <ExperimentSection kind="interpretation">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="The experiment to run before anything else" />
            <CardBody className="space-y-2.5 text-xs leading-relaxed text-ink-muted">
              <p>
                <strong className="text-ink">Set the market to &ldquo;Random walk&rdquo;.</strong> There is now
                provably nothing to find: returns are independent by construction, so no rule based on past
                prices can have any expected edge whatsoever.
              </p>
              <p>
                Now cycle through market seeds. You will find seeds where the moving-average crossover posts a
                healthy positive Sharpe and a smooth-looking equity curve. That performance is entirely luck,
                and you know it is luck because you built the market.
              </p>
              <p>
                This is the most useful thing in the lab. It calibrates your intuition for how convincing a
                backtest can look while containing no signal at all — and it is why the Overfitting Lab exists.
              </p>
              <p>
                <strong className="text-ink">Then try the trending market.</strong> Momentum should win, and it
                should win more as you raise φ. If a rule only works in the environment it was designed for,
                that is evidence it is doing something real rather than fitting noise.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Biases this lab avoids, and ones it cannot" />
            <CardBody>
              <dl className="space-y-2.5 text-xs leading-relaxed">
                {[
                  { term: "Look-ahead bias", status: "avoided", body: "Positions are lagged one day and the test suite enforces it." },
                  { term: "Survivorship bias", status: "avoided", body: "Synthetic data has no survivors — no asset was excluded for having failed." },
                  { term: "Transaction costs", status: "modelled", body: "Charged on turnover, though optimistically: no spread, no impact, no slippage." },
                  { term: "Data snooping", status: "present", body: "If you adjust the windows until the result looks good, you are fitting this particular sample. The Overfitting Lab quantifies exactly how much damage that does." },
                  { term: "Selection bias", status: "present", body: "Six strategies are compared and the best is highlighted. The best of six noise strategies still looks good; that is a property of taking a maximum, not of skill." },
                  { term: "Regime dependence", status: "present", body: "A single market path is one draw from the process. Conclusions that do not survive a seed change are not conclusions." },
                ].map((item) => (
                  <div key={item.term} className="flex gap-2">
                    <Badge tone={item.status === "avoided" ? "positive" : item.status === "modelled" ? "accent" : "caution"}>
                      {item.status}
                    </Badge>
                    <div className="min-w-0">
                      <dt className="text-xs font-semibold text-ink">{item.term}</dt>
                      <dd className="mt-0.5 text-ink-muted">{item.body}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </div>
      </ExperimentSection>

      <ExperimentSection kind="limitations">
        <Callout tone="caution" title="A backtest is a statement about the past of one simulated world">
          <p>
            Every result here is a single path from a process you specified. Changing the seed changes every
            number on the page, often dramatically. The correct way to use a backtest is therefore not to read
            its headline return, but to run it across many seeds and ask whether the <em>distribution</em> of
            outcomes is favourable — which is what the Monte Carlo lab does for prices and what any serious
            strategy evaluation does for strategies.
          </p>
          <p>
            Nothing in this lab tests any real market, any real instrument or any real strategy. The markets
            are synthetic and the costs are simplified. The purpose is to let you observe the mechanics —
            lag, turnover, cost drag, luck — under conditions where you know the ground truth, so that you can
            recognise them when the ground truth is hidden.
          </p>
        </Callout>
      </ExperimentSection>

      <ReproducibilityPanel
        title="Backtesting Lab"
        prefix="BT"
        config={config}
        labels={BACKTEST_LABELS}
        basePath="/labs/backtesting"
        exports={[
          {
            label: "Export equity curves (CSV)",
            filename: `quantverge-backtest-${params.seed}.csv`,
            mime: "text/csv",
            build: () =>
              toCSV(
                market.returns.map((r, i) => ({
                  day: i,
                  market_price: market.prices[i + 1].toFixed(4),
                  market_return: r.toFixed(8),
                  ...Object.fromEntries(
                    results.flatMap((res) => [
                      [`${res.kind}_position`, res.run.positions[i].toFixed(2)],
                      [`${res.kind}_equity`, res.equity[i + 1].toFixed(2)],
                    ]),
                  ),
                })),
              ),
          },
          {
            label: "Export results (JSON)",
            filename: `quantverge-backtest-${params.seed}.json`,
            mime: "application/json",
            build: () =>
              JSON.stringify(
                {
                  experiment: "Backtesting Lab",
                  market: MARKET_LABELS[params.marketProcess],
                  parameters: config,
                  market_lag1_autocorrelation: marketAutocorrelation,
                  results: results.map((r) => ({
                    strategy: STRATEGY_LABELS[r.kind],
                    total_return: r.totalReturn,
                    annualised_return: r.annualReturn,
                    volatility: r.volatility,
                    sharpe_ratio: r.sharpe,
                    max_drawdown: r.maxDrawdown,
                    trades: r.trades,
                    turnover: r.turnover,
                    cost_drag: r.costDrag,
                  })),
                  cost_sensitivity: costAnalysis,
                  note: "Synthetic market, single path. Results are one draw and not evidence about any real strategy.",
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
