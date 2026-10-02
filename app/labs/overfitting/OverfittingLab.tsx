"use client";

import { useMemo, useState } from "react";
import {
  Button, Callout, Card, CardBody, CardHeader, MetricCard, MetricGrid,
  SliderControl, NumberField, DataTable, Badge,
} from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";
import { ExperimentSection, FindingBlock, ResearchOnly } from "@/components/labs/ExperimentSection";
import { LabShell, ReproducibilityPanel } from "@/components/labs/LabShell";
import { EquityChart, HistogramChart, SimpleBarChart, ScatterPlot } from "@/components/charts";
import { applyStrategy, strategySharpe, type StrategyParams } from "@/lib/finance/strategies";
import { generateAR1 } from "@/lib/simulation/generators";
import { pricesFromReturns, annualisedReturn, maxDrawdown, cumulativeReturn } from "@/lib/finance/performance";
import { histogram } from "@/lib/math/distributions";
import { mean, standardDeviation, autocorrelation, percentile } from "@/lib/statistics/descriptive";
import { toCSV } from "@/lib/experiment/config";
import { percent, ratio, integer } from "@/lib/format";
import type { LabMeta } from "@/content/labs";
import {
  OVERFITTING_DEFAULTS, OVERFITTING_LABELS, FAST_WINDOWS, SLOW_WINDOWS, type OverfittingParams,
} from "@/lib/labs/overfitting";

interface GridResult {
  fast: number;
  slow: number;
  trainSharpe: number;
  validationSharpe: number;
  testSharpe: number;
  trades: number;
}

export function OverfittingLab({ lab, initialParams }: { lab: LabMeta; initialParams: OverfittingParams }) {
  const [params, setParams] = useState<OverfittingParams>(initialParams);

  const update = <K extends keyof OverfittingParams>(key: K, value: OverfittingParams[K]) =>
    setParams((previous) => ({ ...previous, [key]: value }));

  /**
   * Generate the market, then split it into three disjoint, contiguous blocks.
   *
   * The split is BY TIME, not random. Shuffling a time series before splitting
   * would leak information across the boundary — a randomly chosen test day sits
   * between two training days, and the autocorrelation between them hands the
   * model the answer. Contiguous blocks are the only honest split for sequential
   * data, and getting this wrong is one of the most common errors when people
   * apply standard machine-learning tooling to time series.
   */
  const data = useMemo(() => {
    const rets = generateAR1({
      drift: params.drift,
      volatility: params.volatility,
      phi: params.signalStrength,
      steps: params.steps,
      seed: params.seed,
    });
    const prices = pricesFromReturns(rets, 100);

    const trainEnd = Math.floor(params.steps * params.trainFraction);
    const validationEnd = trainEnd + Math.floor(params.steps * params.validationFraction);

    return {
      returns: rets,
      prices,
      trainEnd,
      validationEnd,
      // Slices include the extra leading price each segment needs, so moving
      // averages inside a segment are computed only from that segment's data.
      train: { returns: rets.slice(0, trainEnd), prices: prices.slice(0, trainEnd + 1) },
      validation: {
        returns: rets.slice(trainEnd, validationEnd),
        prices: prices.slice(trainEnd, validationEnd + 1),
      },
      test: { returns: rets.slice(validationEnd), prices: prices.slice(validationEnd) },
    };
  }, [params.drift, params.volatility, params.signalStrength, params.steps, params.seed, params.trainFraction, params.validationFraction]);

  /**
   * Exhaustively search the parameter grid, scoring every combination on all
   * three splits. We compute the test score for every combination — not just the
   * winner — purely so the charts can show the relationship between in-sample
   * and out-of-sample performance. A real research process must never look at
   * the test scores before committing to a choice.
   */
  const grid = useMemo(() => {
    const combinations: GridResult[] = [];
    const limit = params.gridSize;

    // A moving-average window longer than a segment produces no signal at all in
    // that segment, so the strategy sits in cash and scores a Sharpe of exactly
    // zero. That is not a strategy result — it is an absence of one, and it
    // would corrupt the comparison: against a field of losing strategies, "never
    // traded" would win the best-on-test row and make a do-nothing rule look
    // like the out-of-sample champion.
    //
    // We therefore admit only combinations whose slow window leaves a usable
    // run of signal in the SHORTEST of the three segments, so every combination
    // in the grid genuinely trades in all three.
    const shortestSegment = Math.min(
      data.train.returns.length, data.validation.returns.length, data.test.returns.length,
    );
    const maxSlowWindow = Math.floor(shortestSegment * 0.35);

    for (const fast of FAST_WINDOWS) {
      for (const slow of SLOW_WINDOWS) {
        if (slow <= fast) continue;
        if (slow > maxSlowWindow) continue;
        if (combinations.length >= limit) break;

        const strategyParams: StrategyParams = { fastWindow: fast, slowWindow: slow, lookback: 20, threshold: 0, seed: 1 };
        const score = (segment: { returns: number[]; prices: number[] }) => {
          const run = applyStrategy(
            "movingAverageCrossover", segment.prices, segment.returns, strategyParams, params.transactionCost,
          );
          return { sharpe: strategySharpe(run.returns, 252), trades: run.trades };
        };

        const trainScore = score(data.train);
        combinations.push({
          fast,
          slow,
          trainSharpe: trainScore.sharpe,
          validationSharpe: score(data.validation).sharpe,
          testSharpe: score(data.test).sharpe,
          trades: trainScore.trades,
        });
      }
      if (combinations.length >= limit) break;
    }
    return combinations;
  }, [data, params.gridSize, params.transactionCost]);

  /** The winner, selected on TRAINING data only — as it must be. */
  const winner = useMemo(
    () => (grid.length === 0 ? null : grid.reduce((best, g) => (g.trainSharpe > best.trainSharpe ? g : best), grid[0])),
    [grid],
  );

  /** For comparison: the combination that would have won had we cheated. */
  const hindsightWinner = useMemo(
    () => (grid.length === 0 ? null : grid.reduce((best, g) => (g.testSharpe > best.testSharpe ? g : best), grid[0])),
    [grid],
  );

  const medianTestSharpe = useMemo(
    () => (grid.length === 0 ? 0 : percentile(grid.map((g) => g.testSharpe), 50)),
    [grid],
  );

  /** The winner's full equity curve across all three segments, for display. */
  const winnerRun = useMemo(() => {
    if (!winner) return null;
    const strategyParams: StrategyParams = {
      fastWindow: winner.fast, slowWindow: winner.slow, lookback: 20, threshold: 0, seed: 1,
    };
    const full = applyStrategy(
      "movingAverageCrossover", data.prices, data.returns, strategyParams, params.transactionCost,
    );
    return full;
  }, [winner, data, params.transactionCost]);

  const realisedPhi = useMemo(() => autocorrelation(data.returns, 1), [data.returns]);

  const generalisationGap = winner ? winner.trainSharpe - winner.testSharpe : 0;

  const config: Record<string, number> = { ...params };

  return (
    <LabShell
      lab={lab}
      question="If I search hundreds of parameter combinations and keep the one with the best historical performance, how much of that performance is a real effect — and how much is the inevitable consequence of having taken a maximum over many noisy numbers?"
    >
      <ExperimentSection kind="inputs">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="The experiment" subtitle="You control whether there is anything real to find." />
            <CardBody className="space-y-4">
              <SliderControl
                label="True signal strength"
                symbol={<InlineMath>{"\\varphi"}</InlineMath>}
                value={params.signalStrength}
                min={0} max={0.3} step={0.01}
                onChange={(v) => update("signalStrength", v)}
                format={(v) => (v === 0 ? "0 — no signal" : v.toFixed(2))}
                hint="The autocorrelation built into the market. At exactly 0 the returns are independent and NO strategy based on past prices can have any edge. Everything the optimiser finds at that setting is, provably, noise."
              />
              {params.signalStrength === 0 ? (
                <Callout tone="caution">
                  <p>
                    <strong className="text-ink">Signal strength is zero.</strong> The returns are independent
                    by construction. Any apparent edge below is fitted noise — and you can watch exactly how
                    convincing that noise manages to look.
                  </p>
                </Callout>
              ) : null}
              <SliderControl
                label="Parameter combinations searched"
                value={params.gridSize}
                min={12} max={240} step={12}
                onChange={(v) => update("gridSize", v)}
                format={(v) => integer(v)}
                hint="The size of the search. The more combinations you try, the higher the best in-sample score will be — even with no signal at all. This is the multiple-comparisons problem."
              />
              <SliderControl
                label="Total trading days"
                value={params.steps}
                min={756} max={10080} step={252}
                onChange={(v) => update("steps", v)}
                format={(v) => `${integer(v)} (${(v / 252).toFixed(0)}y)`}
              />
              <SliderControl
                label="Training fraction"
                value={params.trainFraction}
                min={0.3} max={0.7} step={0.05}
                onChange={(v) => update("trainFraction", v)}
                format={(v) => percent(v, 0)}
              />
              <SliderControl
                label="Validation fraction"
                value={params.validationFraction}
                min={0.1} max={0.4} step={0.05}
                onChange={(v) => update("validationFraction", v)}
                format={(v) => percent(v, 0)}
              />
              <SliderControl
                label="Transaction cost"
                value={params.transactionCost}
                min={0} max={0.003} step={0.00025}
                onChange={(v) => update("transactionCost", v)}
                format={(v) => `${(v * 100).toFixed(3)}%`}
              />
              <SliderControl
                label="Annual volatility"
                value={params.volatility}
                min={0.05} max={0.5} step={0.01}
                onChange={(v) => update("volatility", v)}
                format={(v) => percent(v, 0)}
              />
              <NumberField
                label="Market seed"
                value={params.seed}
                onChange={(v) => update("seed", Math.max(0, Math.floor(v)))}
                min={0} step={1}
              />
              <div className="flex gap-2 border-t border-line pt-3">
                <Button size="sm" onClick={() => update("seed", Math.floor(Math.random() * 1_000_000))}>
                  New market
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setParams(OVERFITTING_DEFAULTS)}>
                  Reset
                </Button>
              </div>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader
                title="The split"
                subtitle="Contiguous blocks in time order. Never shuffle a time series before splitting it."
              />
              <CardBody className="space-y-3">
                <div className="flex h-8 w-full overflow-hidden rounded border border-line text-2xs font-medium">
                  <div
                    className="grid place-items-center bg-accent text-accent-ink"
                    style={{ width: `${params.trainFraction * 100}%` }}
                  >
                    Train {percent(params.trainFraction, 0)}
                  </div>
                  <div
                    className="grid place-items-center bg-caution/70 text-canvas"
                    style={{ width: `${params.validationFraction * 100}%` }}
                  >
                    Validation {percent(params.validationFraction, 0)}
                  </div>
                  <div
                    className="grid place-items-center bg-positive/70 text-canvas"
                    style={{ width: `${(1 - params.trainFraction - params.validationFraction) * 100}%` }}
                  >
                    Test {percent(1 - params.trainFraction - params.validationFraction, 0)}
                  </div>
                </div>
                <div className="grid gap-2 text-2xs leading-relaxed text-ink-muted sm:grid-cols-3">
                  <p><strong className="text-ink">Train.</strong> The optimiser sees this and picks a winner. Days 0–{integer(data.trainEnd)}.</p>
                  <p><strong className="text-ink">Validation.</strong> Used to check the choice before committing. Days {integer(data.trainEnd)}–{integer(data.validationEnd)}.</p>
                  <p><strong className="text-ink">Test.</strong> Touched exactly once, at the end. Days {integer(data.validationEnd)}–{integer(params.steps)}.</p>
                </div>

                {winnerRun && winner ? (
                  <EquityChart
                    series={[
                      { key: "strategy", label: `Optimised strategy (${winner.fast}/${winner.slow})`, values: winnerRun.equity.map((v) => v * 100), color: "var(--series-2)", width: 1.8 },
                      { key: "market", label: "Buy and hold", values: data.prices, color: "var(--series-1)" },
                    ]}
                    title="The optimised strategy across all three periods"
                    description="Equity curve of the parameter combination that scored best on the training data, extended across the validation and test periods. The shaded bands mark the three segments."
                    regimes={[
                      { start: 0, end: data.trainEnd, color: "var(--accent)", name: "Train" },
                      { start: data.trainEnd, end: data.validationEnd, color: "var(--caution)", name: "Validation" },
                      { start: data.validationEnd, end: params.steps, color: "var(--positive)", name: "Test" },
                    ]}
                    formatY={(v) => `$${v.toFixed(0)}`}
                    yLabel="Value"
                    height={300}
                    footnote="Watch the strategy curve across the boundary into the test period. Performance that stops the moment the optimiser can no longer see the data is the signature of overfitting."
                  />
                ) : null}
              </CardBody>
            </Card>

            {winner ? (
              <MetricGrid>
                <MetricCard
                  label="In-sample Sharpe"
                  value={ratio(winner.trainSharpe, 3)}
                  tone={winner.trainSharpe > 0.5 ? "positive" : "neutral"}
                  hint="The best score found across the whole parameter grid, on the training data. This is the number that gets put in a pitch deck."
                />
                <MetricCard
                  label="Validation Sharpe"
                  value={ratio(winner.validationSharpe, 3)}
                  tone={winner.validationSharpe > 0.2 ? "positive" : winner.validationSharpe < 0 ? "negative" : "caution"}
                />
                <MetricCard
                  label="Out-of-sample Sharpe"
                  value={ratio(winner.testSharpe, 3)}
                  tone={winner.testSharpe > 0.2 ? "positive" : winner.testSharpe < 0 ? "negative" : "caution"}
                  hint="The same parameters on data the optimiser never saw. This is the only number that means anything."
                />
                <MetricCard
                  label="Generalisation gap"
                  value={ratio(generalisationGap, 3)}
                  tone={generalisationGap > 0.5 ? "negative" : "neutral"}
                  hint="In-sample minus out-of-sample. A large positive gap means the apparent edge did not survive contact with new data."
                />
              </MetricGrid>
            ) : null}
          </div>
        </div>
      </ExperimentSection>

      {/* ---------------- Model ---------------- */}
      <ExperimentSection kind="model" title="The mathematics of looking too hard">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Why the maximum is biased" />
            <CardBody className="space-y-3">
              <EquationBlock
                equation={"E\\left[\\max_{1 \\le i \\le n} Z_i\\right] \\approx \\sqrt{2\\ln n}\\quad \\text{for } Z_i \\sim N(0,1)"}
                description="The expected maximum of n independent standard normal draws. It grows without bound as n increases, even though every individual draw has mean zero."
              />
              <p className="text-xs leading-relaxed text-ink-muted">
                Apply this to strategy selection. Each combination&rsquo;s in-sample Sharpe is roughly a noisy
                estimate of its true Sharpe, with standard error approximately{" "}
                <InlineMath>{"\\sqrt{(1 + S^2/2)/T}"}</InlineMath>. With {integer(data.train.returns.length)}{" "}
                training days that standard error is about{" "}
                {ratio(Math.sqrt(1 / data.train.returns.length) * Math.sqrt(252), 3)} in annualised terms.
              </p>
              <p className="text-xs leading-relaxed text-ink-muted">
                Searching {integer(grid.length)} combinations therefore inflates the best observed Sharpe by
                roughly <InlineMath>{"\\sqrt{2\\ln n}"}</InlineMath> ≈{" "}
                {ratio(Math.sqrt(2 * Math.log(Math.max(2, grid.length))), 2)} standard errors — about{" "}
                <strong className="text-ink">
                  {ratio(Math.sqrt(2 * Math.log(Math.max(2, grid.length))) * Math.sqrt(252 / data.train.returns.length), 2)}
                </strong>{" "}
                of Sharpe, purely from selection. Compare that to the observed in-sample score of{" "}
                {winner ? ratio(winner.trainSharpe, 3) : "—"}.
              </p>
              <Callout tone="caution" title="The combinations are not independent">
                <p>
                  The estimate above assumes independent trials, but neighbouring parameter combinations are
                  highly correlated — a 20/100 crossover behaves much like a 20/120 one. That makes the
                  effective number of independent trials smaller than the grid size, so the formula
                  overstates the inflation somewhat. It remains the right order of magnitude and the right
                  intuition: the inflation is real, and it grows with how hard you look.
                </p>
              </Callout>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="The biases this demonstrates" />
            <CardBody>
              <dl className="space-y-3 text-xs leading-relaxed">
                {[
                  { term: "Overfitting", body: "Fitting the noise in a particular sample rather than the structure of the process that generated it. The model describes the data perfectly and the world not at all." },
                  { term: "Data snooping", body: "Reusing the same data to generate a hypothesis and to test it. Every parameter you adjust after seeing results spends some of the data's evidential value." },
                  { term: "Multiple testing", body: "Testing many hypotheses and reporting the best. A 5% significance threshold means one in twenty pure-noise tests passes; try a hundred and five will." },
                  { term: "Look-ahead bias", body: "Using information not available at decision time. Avoided here by the one-step position lag, which the Backtesting Lab explains in detail." },
                  { term: "Survivorship bias", body: "Testing only on assets that still exist today. Not present in synthetic data — but it quietly inflates nearly every historical equity study." },
                  { term: "Selection bias", body: "Reporting the strategies that worked and discarding the ones that did not. The discarded attempts are part of the evidence; omitting them makes the survivor look far stronger than it is." },
                ].map((item) => (
                  <div key={item.term}>
                    <dt className="font-semibold text-ink">{item.term}</dt>
                    <dd className="mt-0.5 text-ink-muted">{item.body}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </div>
      </ExperimentSection>

      {/* ---------------- Results ---------------- */}
      <ExperimentSection kind="results">
        {winner && hindsightWinner ? (
          <div className="space-y-4">
            <Card>
              <CardHeader
                title="What the search found"
                subtitle={`${integer(grid.length)} parameter combinations evaluated on each of the three segments. Combinations whose slow window is too long to generate a signal within the shortest segment are excluded, so every entry genuinely trades in all three.`}
              />
              <CardBody className="space-y-4">
                <DataTable
                  columns={["Selection method", "Parameters", "Train Sharpe", "Validation Sharpe", "Test Sharpe", "Honest?"]}
                  align={["left", "left", "right", "right", "right", "left"]}
                  caption="Three ways of choosing parameters. Only the first is legitimate; the others are shown to quantify how much they inflate the result."
                  rows={[
                    [
                      "Best on training data",
                      `${winner.fast} / ${winner.slow}`,
                      ratio(winner.trainSharpe, 3),
                      ratio(winner.validationSharpe, 3),
                      ratio(winner.testSharpe, 3),
                      <span key="a" className="text-positive">Legitimate</span>,
                    ],
                    [
                      "Best on test data (hindsight)",
                      `${hindsightWinner.fast} / ${hindsightWinner.slow}`,
                      ratio(hindsightWinner.trainSharpe, 3),
                      ratio(hindsightWinner.validationSharpe, 3),
                      ratio(hindsightWinner.testSharpe, 3),
                      <span key="b" className="text-negative">Cheating</span>,
                    ],
                    [
                      "Median of all combinations",
                      "—",
                      ratio(percentile(grid.map((g) => g.trainSharpe), 50), 3),
                      ratio(percentile(grid.map((g) => g.validationSharpe), 50), 3),
                      ratio(medianTestSharpe, 3),
                      <span key="c" className="text-ink-muted">Baseline</span>,
                    ],
                  ]}
                />

                <div className="grid gap-4 lg:grid-cols-2">
                  <ScatterPlot
                    points={grid.map((g) => ({ x: g.trainSharpe, y: g.testSharpe }))}
                    highlights={[
                      { x: winner.trainSharpe, y: winner.testSharpe, label: "Selected on train", color: "var(--series-2)" },
                    ]}
                    title="In-sample vs out-of-sample Sharpe"
                    description="Each point is one parameter combination, with its training Sharpe on the horizontal axis and its test Sharpe on the vertical axis. If in-sample performance predicted out-of-sample performance, the cloud would run along the diagonal."
                    xLabel="Train Sharpe"
                    yLabel="Test Sharpe"
                    formatX={(v) => v.toFixed(2)}
                    formatY={(v) => v.toFixed(2)}
                    height={300}
                    footnote={`Correlation between train and test Sharpe across the grid: ${ratio(correlationOf(grid.map((g) => g.trainSharpe), grid.map((g) => g.testSharpe)), 3)}. A value near zero means in-sample ranking carries no information about out-of-sample performance.`}
                  />

                  <HistogramChart
                    bins={histogram(grid.map((g) => g.trainSharpe), 24)}
                    title="Distribution of in-sample Sharpe ratios"
                    description="Histogram of the training Sharpe ratio across every parameter combination tried. The selected strategy sits at the extreme right edge — which is what 'best' means."
                    xLabel="Train Sharpe"
                    formatX={(v) => v.toFixed(2)}
                    markers={[
                      { value: winner.trainSharpe, label: "Selected", color: "var(--series-2)" },
                      { value: mean(grid.map((g) => g.trainSharpe)), label: "Grid mean", color: "var(--ink-faint)" },
                    ]}
                    height={300}
                    footnote="Selecting the maximum of a distribution of noisy estimates guarantees you pick one whose error happened to be positive. That is the mechanism of overfitting, stated in one sentence."
                  />
                </div>

                <FindingBlock
                  observation={
                    <>
                      Searching {integer(grid.length)} combinations on a market with true autocorrelation{" "}
                      {params.signalStrength === 0 ? (
                        <strong className="text-ink">exactly zero</strong>
                      ) : (
                        <>φ = {params.signalStrength.toFixed(2)}</>
                      )}{" "}
                      (realised {ratio(realisedPhi, 4)}) produced a best in-sample Sharpe of{" "}
                      <strong className="text-ink">{ratio(winner.trainSharpe, 3)}</strong>. The same parameters
                      scored <strong className="text-ink">{ratio(winner.testSharpe, 3)}</strong> on the held-out
                      test period — a generalisation gap of {ratio(generalisationGap, 3)}. The median
                      combination scored {ratio(medianTestSharpe, 3)} out of sample.
                    </>
                  }
                  interpretation={
                    params.signalStrength === 0 ? (
                      <>
                        <p>
                          There is no signal in this market. The returns are independent by construction, so the
                          true out-of-sample Sharpe of every combination in the grid is exactly zero. The in-sample
                          Sharpe of {ratio(winner.trainSharpe, 3)} is therefore <em>entirely</em> an artefact of
                          selection.
                        </p>
                        <p className="mt-2">
                          The mechanism is simple and inescapable. Each combination&rsquo;s in-sample Sharpe is a
                          noisy estimate of zero. Take {integer(grid.length)} draws from a distribution centred on
                          zero and keep the largest, and you will reliably get something well above zero — not
                          because anything is there, but because you asked {integer(grid.length)} times. The
                          expected maximum of n independent standard normals grows roughly like{" "}
                          <InlineMath>{"\\sqrt{2\\ln n}"}</InlineMath>, so the inflation gets worse the harder
                          you look.
                        </p>
                      </>
                    ) : (
                      <>
                        <p>
                          This market does contain real structure (φ = {params.signalStrength.toFixed(2)}), so
                          some of the in-sample performance is genuine. But the selected combination still
                          captures both the signal <em>and</em> whatever noise happened to favour it, which is why
                          the test score falls short of the training score.
                        </p>
                        <p className="mt-2">
                          The useful comparison is against the median combination&rsquo;s test score of{" "}
                          {ratio(medianTestSharpe, 3)}. If the selected strategy beats that out of sample, the
                          optimiser found something real; if it does not, the search identified noise that
                          happened to look like signal.
                        </p>
                      </>
                    )
                  }
                  conclusion={
                    <>
                      A strategy performing well historically does not necessarily contain a real predictive
                      signal. The in-sample score of a strategy selected from a search is not an estimate of its
                      future performance — it is an estimate of its future performance <em>plus</em> a selection
                      bias that grows with the size of the search.
                    </>
                  }
                  limitation={
                    <>
                      This is a single market path. Run several seeds before drawing any conclusion from the
                      numbers above: on some seeds the overfit strategy will happen to do well out of sample
                      too, and mistaking that for validation is precisely the error the lab is about. The test
                      set here is also used repeatedly as you move the sliders — which, strictly, means it has
                      stopped being a test set. In real research you get one look.
                    </>
                  }
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Does searching harder help?"
                subtitle="In-sample Sharpe against the number of combinations tried, holding the market fixed."
              />
              <CardBody>
                <SimpleBarChart
                  data={[12, 36, 72, 120, 180, 240]
                    .filter((n) => n <= grid.length)
                    .map((n) => {
                      const subset = grid.slice(0, n);
                      const bestOfSubset = subset.reduce((b, g) => (g.trainSharpe > b.trainSharpe ? g : b), subset[0]);
                      return {
                        searched: String(n),
                        inSample: bestOfSubset.trainSharpe,
                        outOfSample: bestOfSubset.testSharpe,
                      };
                    })}
                  xKey="searched"
                  bars={[
                    { key: "inSample", label: "Best in-sample Sharpe", color: "var(--series-2)" },
                    { key: "outOfSample", label: "Its out-of-sample Sharpe", color: "var(--series-3)" },
                  ]}
                  title="Search size versus performance"
                  description="Paired bars showing the best training Sharpe found, and that same strategy's test Sharpe, as the number of combinations searched grows. The in-sample bar rises steadily; the out-of-sample bar does not follow it."
                  formatY={(v) => v.toFixed(2)}
                  height={260}
                  footnote="The in-sample bar climbs with search size because taking a maximum over more noisy numbers produces a bigger maximum. The out-of-sample bar does not, because the extra search found nothing real. The widening gap between the two IS the overfitting."
                />
              </CardBody>
            </Card>

            <ResearchOnly>
              <Card>
                <CardHeader title="Full parameter grid" subtitle="Every combination, sorted by training Sharpe." />
                <CardBody>
                  <DataTable
                    columns={["Fast", "Slow", "Train Sharpe", "Validation Sharpe", "Test Sharpe", "Gap", "Trades"]}
                    align={["right", "right", "right", "right", "right", "right", "right"]}
                    caption="Showing the top 25 by in-sample score. Notice how weakly the ordering is preserved in the test column."
                    rows={[...grid]
                      .sort((a, b) => b.trainSharpe - a.trainSharpe)
                      .slice(0, 25)
                      .map((g) => [
                        integer(g.fast),
                        integer(g.slow),
                        ratio(g.trainSharpe, 3),
                        ratio(g.validationSharpe, 3),
                        <span key="t" className={g.testSharpe < 0 ? "text-negative" : undefined}>{ratio(g.testSharpe, 3)}</span>,
                        ratio(g.trainSharpe - g.testSharpe, 3),
                        integer(g.trades),
                      ])}
                  />
                </CardBody>
              </Card>
            </ResearchOnly>
          </div>
        ) : null}
      </ExperimentSection>

      <ExperimentSection kind="interpretation">
        <Card>
          <CardHeader title="Experiments that make the point land" />
          <CardBody>
            <ol className="space-y-2.5 text-xs leading-relaxed text-ink-muted">
              {[
                "Leave signal strength at 0. Try ten different market seeds and write down the best in-sample Sharpe each time. You will see values above 1.0 regularly, in a market where the true Sharpe of every strategy is exactly zero.",
                "Hold the seed fixed and slide the search size from 12 to 240. The in-sample score climbs; the out-of-sample score does not. The gap between the two bars is manufactured entirely by the act of searching.",
                "Raise signal strength to 0.15 and compare the selected strategy's test Sharpe against the median combination's test Sharpe. When real signal exists, the selection genuinely beats the median — that contrast is what a working research process looks like.",
                "Shrink the training fraction to 0.3. With less data the in-sample estimates are noisier, the maximum is more inflated, and the generalisation gap widens. More data is the most reliable defence against overfitting.",
                "Set transaction costs to zero and watch every in-sample Sharpe rise. Free trading makes overfitting easier, because high-turnover noise-fitting strategies stop being penalised.",
              ].map((text, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="tabular shrink-0 text-accent">{String(i + 1).padStart(2, "0")}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </ExperimentSection>

      <ExperimentSection kind="limitations">
        <Callout tone="caution" title="This lab is itself an example of the problem">
          <p>
            Every time you move a slider, you look at the test-set result again. After a dozen adjustments, the
            test set has informed your choices and is no longer a clean estimate of out-of-sample performance.
            This is not a flaw in the lab — it is the honest demonstration of why the discipline is so hard to
            maintain. A test set is a <em>single-use</em> instrument, and almost nobody treats it that way.
          </p>
          <p>
            The validation set exists to absorb this. The intended workflow is: search on training, compare
            candidates on validation, and touch the test set exactly once, at the very end, to produce the
            number you report. Anything else and the reported figure is optimistic by an amount nobody can
            quantify.
          </p>
          <p>
            Finally, note that the strongest defence demonstrated here is not a statistical correction — it is
            knowing the ground truth. Setting signal strength to zero lets you see overfitting unambiguously
            because you built a world with no signal in it. On real data that certainty never exists, which is
            why out-of-sample discipline, pre-registration of hypotheses, and scepticism about impressive
            backtests have to substitute for it.
          </p>
        </Callout>
      </ExperimentSection>

      <ReproducibilityPanel
        title="Overfitting Lab"
        prefix="OVF"
        config={config}
        labels={OVERFITTING_LABELS}
        basePath="/labs/overfitting"
        exports={[
          {
            label: "Export parameter grid (CSV)",
            filename: `quantlab-overfitting-${params.seed}.csv`,
            mime: "text/csv",
            build: () =>
              toCSV(
                grid.map((g) => ({
                  fast_window: g.fast,
                  slow_window: g.slow,
                  train_sharpe: g.trainSharpe.toFixed(6),
                  validation_sharpe: g.validationSharpe.toFixed(6),
                  test_sharpe: g.testSharpe.toFixed(6),
                  generalisation_gap: (g.trainSharpe - g.testSharpe).toFixed(6),
                  trades: g.trades,
                })),
              ),
          },
          {
            label: "Export findings (JSON)",
            filename: `quantlab-overfitting-${params.seed}.json`,
            mime: "application/json",
            build: () =>
              JSON.stringify(
                {
                  experiment: "Overfitting Lab",
                  parameters: config,
                  true_signal_strength: params.signalStrength,
                  realised_lag1_autocorrelation: realisedPhi,
                  combinations_searched: grid.length,
                  selected_on_training: winner,
                  best_in_hindsight: hindsightWinner,
                  median_test_sharpe: medianTestSharpe,
                  generalisation_gap: generalisationGap,
                  note: "Synthetic data. When signal strength is zero, every apparent edge is selection bias by construction.",
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

/** Pearson correlation, inlined to avoid importing the full statistics module. */
function correlationOf(xs: number[], ys: number[]): number {
  if (xs.length < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  const sx = standardDeviation(xs, 1);
  const sy = standardDeviation(ys, 1);
  if (sx === 0 || sy === 0) return 0;
  let sum = 0;
  for (let i = 0; i < xs.length; i++) sum += (xs[i] - mx) * (ys[i] - my);
  return sum / (xs.length - 1) / (sx * sy);
}
