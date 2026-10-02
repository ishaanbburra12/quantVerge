"use client";

import { useMemo, useState } from "react";
import { useDebounced } from "@/lib/hooks/useBatchedSimulation";
import {
  Button, Callout, Card, CardBody, CardHeader, MetricCard, MetricGrid,
  SliderControl, NumberField, Toggle, DataTable, Badge, Tabs,
} from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";
import { ExperimentSection, FindingBlock, ResearchOnly } from "@/components/labs/ExperimentSection";
import { LabShell, ReproducibilityPanel } from "@/components/labs/LabShell";
import { EquityChart, MultiLineChart, SimpleBarChart, ChartLegend } from "@/components/charts";
import {
  generateRegimeMarket, stationaryDistribution, type Regime,
} from "@/lib/simulation/generators";
import { maxDrawdown } from "@/lib/finance/performance";
import { rollingMean, rollingVolatility, mean, standardDeviation, kurtosis } from "@/lib/statistics/descriptive";
import { toCSV } from "@/lib/experiment/config";
import { percent, ratio, integer, currency } from "@/lib/format";
import type { LabMeta } from "@/content/labs";
import {
  REGIME_DEFAULTS, REGIME_LABELS, buildTransitionMatrix, type RegimeParams,
} from "@/lib/labs/marketRegimes";

const REGIME_NAMES = ["Bull", "Bear", "Sideways"] as const;
const REGIME_COLORS = ["var(--regime-bull)", "var(--regime-bear)", "var(--regime-sideways)"];

type ViewTab = "price" | "returns" | "volatility" | "drawdown";

export function RegimeLab({ lab, initialParams }: { lab: LabMeta; initialParams: RegimeParams }) {
  const [liveParams, setParams] = useState<RegimeParams>(initialParams);
  /**
   * `liveParams` updates on every mousemove so the slider thumb tracks the
   * finger. Everything downstream — the simulation AND the chart props — reads
   * the debounced copy instead, so dragging triggers one recompute and one chart
   * render rather than one per pixel. The chart captions are also more honest
   * this way: they describe the parameters that were actually simulated, not a
   * value the slider is still travelling through.
   */
  const params = useDebounced(liveParams, 160);
  const [hideRegimes, setHideRegimes] = useState(false);
  const [view, setView] = useState<ViewTab>("price");

  const update = <K extends keyof RegimeParams>(key: K, value: RegimeParams[K]) =>
    setParams((previous) => ({ ...previous, [key]: value }));

  const transition = useMemo(
    () => buildTransitionMatrix(params.bullPersistence, params.bearPersistence, params.sidewaysPersistence),
    [params.bullPersistence, params.bearPersistence, params.sidewaysPersistence],
  );

  const regimes: Regime[] = useMemo(
    () => [
      { name: "Bull", drift: params.bullDrift, volatility: params.bullVol, color: REGIME_COLORS[0] },
      { name: "Bear", drift: params.bearDrift, volatility: params.bearVol, color: REGIME_COLORS[1] },
      { name: "Sideways", drift: params.sidewaysDrift, volatility: params.sidewaysVol, color: REGIME_COLORS[2] },
    ],
    [params],
  );

  const simulation = useMemo(
    () =>
      generateRegimeMarket({
        regimes,
        transition,
        steps: params.steps,
        seed: params.seed,
        initialPrice: params.initialPrice,
        initialRegime: 0,
      }),
    [regimes, transition, params.steps, params.seed, params.initialPrice],
  );

  /** Contiguous runs of a single regime, used to shade the chart background. */
  const regimeBlocks = useMemo(() => {
    const blocks: { start: number; end: number; color: string; name: string; state: number }[] = [];
    let start = 0;
    for (let i = 1; i <= simulation.regimes.length; i++) {
      if (i === simulation.regimes.length || simulation.regimes[i] !== simulation.regimes[start]) {
        const state = simulation.regimes[start];
        blocks.push({ start, end: i - 1, color: REGIME_COLORS[state], name: REGIME_NAMES[state], state });
        start = i;
      }
    }
    return blocks;
  }, [simulation.regimes]);

  const stationary = useMemo(() => stationaryDistribution(transition), [transition]);

  const rollingVol = useMemo(
    () => rollingVolatility(simulation.returns, params.detectionWindow, 252),
    [simulation.returns, params.detectionWindow],
  );
  const rollingRet = useMemo(
    () => rollingMean(simulation.returns, params.detectionWindow).map((v) => (v === null ? null : v * 252)),
    [simulation.returns, params.detectionWindow],
  );

  const drawdown = useMemo(() => maxDrawdown(simulation.prices), [simulation.prices]);

  /** Per-regime realised statistics — the ground truth we can only see because the data is synthetic. */
  const perRegimeStats = useMemo(
    () =>
      REGIME_NAMES.map((name, state) => {
        const rets = simulation.returns.filter((_, i) => simulation.regimes[i] === state);
        const days = rets.length;
        return {
          name,
          state,
          days,
          occupancy: simulation.occupancy[state],
          stationary: stationary[state],
          expectedDuration: 1 / (1 - transition[state][state]),
          realisedDrift: days > 1 ? mean(rets) * 252 : 0,
          realisedVol: days > 1 ? standardDeviation(rets, 1) * Math.sqrt(252) : 0,
          targetDrift: regimes[state].drift,
          targetVol: regimes[state].volatility,
        };
      }),
    [simulation, stationary, transition, regimes],
  );

  /**
   * A deliberately simple regime detector: classify each day by whether its
   * trailing volatility and trailing return are high or low.
   *
   * This is NOT a good estimator — a hidden Markov model fitted by
   * Baum-Welch would do far better — and that is the point. The challenge is to
   * see how much of the hidden state a crude observable rule can recover, and
   * where it fails.
   */
  const detection = useMemo(() => {
    const definedVol = rollingVol.filter((v): v is number => v !== null);
    if (definedVol.length === 0) return null;
    const volThreshold = mean(definedVol);
    const guesses: (number | null)[] = [];
    let correct = 0;
    let evaluated = 0;
    const confusion = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];

    for (let i = 0; i < simulation.returns.length; i++) {
      const vol = rollingVol[i];
      const ret = rollingRet[i];
      if (vol === null || ret === null) {
        guesses.push(null);
        continue;
      }
      // High volatility -> Bear. Otherwise positive trailing return -> Bull,
      // and anything else -> Sideways.
      let guess: number;
      if (vol > volThreshold * 1.25) guess = 1;
      else if (ret > 0.04) guess = 0;
      else guess = 2;
      guesses.push(guess);
      confusion[simulation.regimes[i]][guess] += 1;
      if (guess === simulation.regimes[i]) correct += 1;
      evaluated += 1;
    }
    return {
      guesses,
      accuracy: evaluated > 0 ? correct / evaluated : 0,
      evaluated,
      confusion,
      // The accuracy you would get by always guessing the most common regime.
      baseline: Math.max(...simulation.occupancy),
      volThreshold,
    };
  }, [rollingVol, rollingRet, simulation]);

  const config: Record<string, number> = { ...params };

  return (
    <LabShell
      lab={lab}
      question="If a market switches between hidden states that each have their own drift and volatility, how much of that hidden structure can be recovered from the observable price series alone — and how does the answer depend on how long the regimes persist?"
    >
      {/* ---------------- Inputs ---------------- */}
      <ExperimentSection kind="inputs">
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card>
              <CardHeader title="Regime parameters" subtitle="Each regime has its own annualised drift and volatility." />
              <CardBody className="space-y-5">
                {[
                  { name: "Bull", driftKey: "bullDrift" as const, volKey: "bullVol" as const, persistKey: "bullPersistence" as const, color: REGIME_COLORS[0] },
                  { name: "Bear", driftKey: "bearDrift" as const, volKey: "bearVol" as const, persistKey: "bearPersistence" as const, color: REGIME_COLORS[1] },
                  { name: "Sideways", driftKey: "sidewaysDrift" as const, volKey: "sidewaysVol" as const, persistKey: "sidewaysPersistence" as const, color: REGIME_COLORS[2] },
                ].map((regime) => (
                  <div key={regime.name} className="space-y-2.5 border-l-2 pl-3" style={{ borderColor: regime.color }}>
                    <p className="text-xs font-semibold" style={{ color: regime.color }}>
                      {regime.name}
                    </p>
                    <SliderControl
                      label="Drift"
                      value={params[regime.driftKey]}
                      min={-0.5}
                      max={0.5}
                      step={0.01}
                      onChange={(v) => update(regime.driftKey, v)}
                      format={(v) => percent(v, 0)}
                    />
                    <SliderControl
                      label="Volatility"
                      value={params[regime.volKey]}
                      min={0.02}
                      max={0.8}
                      step={0.01}
                      onChange={(v) => update(regime.volKey, v)}
                      format={(v) => percent(v, 0)}
                    />
                    <SliderControl
                      label="Persistence"
                      value={params[regime.persistKey]}
                      min={0.5}
                      max={0.995}
                      step={0.005}
                      onChange={(v) => update(regime.persistKey, v)}
                      format={(v) => `${v.toFixed(3)} · ~${Math.round(1 / (1 - v))}d`}
                      hint="P(stay in this regime next day). Expected run length is 1/(1−p), so 0.97 means roughly 33 days."
                    />
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Simulation" />
              <CardBody className="space-y-4">
                <SliderControl
                  label="Trading days"
                  value={liveParams.steps}
                  min={252}
                  max={5040}
                  step={252}
                  onChange={(v) => update("steps", v)}
                  format={(v) => `${integer(v)} (${(v / 252).toFixed(0)}y)`}
                />
                <SliderControl
                  label="Detection window"
                  value={liveParams.detectionWindow}
                  min={10}
                  max={120}
                  step={5}
                  onChange={(v) => update("detectionWindow", v)}
                  format={(v) => `${v} days`}
                  hint="The lookback used for rolling statistics. Short windows react quickly but are noisy; long windows are smooth but lag the regime change."
                />
                <NumberField
                  label="Random seed"
                  value={liveParams.seed}
                  onChange={(v) => update("seed", Math.max(0, Math.floor(v)))}
                  min={0}
                  step={1}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => update("seed", Math.floor(Math.random() * 1_000_000))}>
                    New seed
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setParams(REGIME_DEFAULTS)}>
                    Reset
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Simulated market"
                subtitle={
                  hideRegimes
                    ? "Regime labels hidden. Can you tell where the state changed?"
                    : "Background shading shows the true hidden regime at each point in time."
                }
                actions={<Toggle label="Hide regimes" checked={hideRegimes} onChange={setHideRegimes} />}
              />
              <CardBody className="space-y-3">
                <Tabs
                  ariaLabel="Market view"
                  active={view}
                  onChange={setView}
                  tabs={[
                    { value: "price", label: "Price" },
                    { value: "returns", label: "Returns" },
                    { value: "volatility", label: "Rolling volatility" },
                    { value: "drawdown", label: "Drawdown" },
                  ]}
                />

                {!hideRegimes ? (
                  <ChartLegend items={REGIME_NAMES.map((name, i) => ({ label: name, color: REGIME_COLORS[i] }))} />
                ) : null}

                {view === "price" ? (
                  <EquityChart
                    series={[{ key: "price", label: "Price", values: simulation.prices, color: "var(--ink)" }]}
                    title="Price path with hidden regimes"
                    description={`A ${(params.steps / 252).toFixed(0)}-year synthetic price path. ${hideRegimes ? "Regime labels are hidden." : "The background is shaded green during bull regimes, red during bear regimes and grey during sideways regimes."}`}
                    regimes={hideRegimes ? undefined : regimeBlocks}
                    peakIndex={drawdown.peakIndex}
                    troughIndex={drawdown.troughIndex}
                    peakValue={simulation.prices[drawdown.peakIndex]}
                    troughValue={simulation.prices[drawdown.troughIndex]}
                    formatY={(v) => `$${v.toFixed(0)}`}
                    yLabel="Price"
                    height={330}
                    footnote={`Maximum drawdown ${percent(drawdown.maxDrawdown, 1)}, from day ${drawdown.peakIndex} to day ${drawdown.troughIndex}.`}
                  />
                ) : null}

                {view === "returns" ? (
                  <MultiLineChart
                    series={[{ key: "r", label: "Daily return", values: simulation.returns, color: "var(--series-1)", width: 0.8 }]}
                    title="Daily returns"
                    description="Daily returns over time. Note how the amplitude of the oscillation changes between quiet and turbulent stretches — this is volatility clustering, produced here purely by regime switching."
                    xLabel="Trading day"
                    yLabel="Return"
                    formatY={(v) => percent(v, 1)}
                    referenceY={0}
                    height={300}
                    showLegend={false}
                    footnote="Each point is conditionally normal given the regime. The unconditional distribution is a mixture of three normals, which is why it has fat tails."
                  />
                ) : null}

                {view === "volatility" ? (
                  <MultiLineChart
                    series={[
                      { key: "vol", label: `${params.detectionWindow}-day realised volatility`, values: rollingVol, color: "var(--series-5)" },
                      { key: "bull", label: "Bull σ", values: simulation.returns.map(() => params.bullVol), color: REGIME_COLORS[0], dashed: true, width: 1 },
                      { key: "bear", label: "Bear σ", values: simulation.returns.map(() => params.bearVol), color: REGIME_COLORS[1], dashed: true, width: 1 },
                    ]}
                    title="Rolling realised volatility"
                    description="Trailing realised volatility compared with the true volatility of each regime, shown as dashed reference lines. Realised volatility rises toward the bear level during bear markets, but lags the switch."
                    xLabel="Trading day"
                    yLabel="Annualised volatility"
                    formatY={(v) => percent(v, 0)}
                    height={300}
                    footnote="Realised volatility is the single most informative observable for regime detection — but it reacts only after enough high-volatility days have entered the window."
                  />
                ) : null}

                {view === "drawdown" ? (
                  <MultiLineChart
                    series={[{ key: "dd", label: "Drawdown from peak", values: drawdown.series, color: "var(--negative)" }]}
                    title="Drawdown"
                    description="Percentage below the running high-water mark. Long flat stretches at zero are periods of new highs; deep troughs mark the bear regimes."
                    xLabel="Trading day"
                    yLabel="Drawdown"
                    formatY={(v) => percent(v, 0)}
                    referenceY={0}
                    height={300}
                    showLegend={false}
                    footnote={`Longest stretch below a prior peak: ${integer(drawdown.longestDrawdownLength)} days.`}
                  />
                ) : null}
              </CardBody>
            </Card>

            <MetricGrid>
              <MetricCard label="Final price" value={currency(simulation.prices[simulation.prices.length - 1])} />
              <MetricCard
                label="Total return"
                value={percent(simulation.prices[simulation.prices.length - 1] / params.initialPrice - 1, 1)}
                tone={simulation.prices[simulation.prices.length - 1] > params.initialPrice ? "positive" : "negative"}
              />
              <MetricCard label="Max drawdown" value={percent(drawdown.maxDrawdown, 1)} tone="negative" />
              <MetricCard
                label="Excess kurtosis"
                value={ratio(kurtosis(simulation.returns), 2)}
                tone="caution"
                hint="Above zero means fatter tails than a normal distribution. Regime switching produces this even though each regime is individually normal."
              />
            </MetricGrid>
          </div>
        </div>
      </ExperimentSection>

      {/* ---------------- Model ---------------- */}
      <ExperimentSection kind="model">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="A Markov chain over hidden states" />
            <CardBody className="space-y-3">
              <EquationBlock
                equation={"P(s_{t+1} = j \\mid s_t = i,\\, s_{t-1}, \\ldots, s_0) = P(s_{t+1} = j \\mid s_t = i) = P_{ij}"}
                description="The Markov property: the next state depends only on the current state, not on how we got there."
                where={[
                  { symbol: "s_t", meaning: "the hidden regime at time t" },
                  { symbol: "P_{ij}", meaning: "the probability of moving from regime i to regime j in one step" },
                ]}
              />
              <p className="text-xs leading-relaxed text-ink-muted">
                Conditional on being in regime <InlineMath>{"i"}</InlineMath>, the return is generated exactly
                as in the Monte Carlo lab, with that regime&rsquo;s drift and volatility:
              </p>
              <EquationBlock
                equation={"r_t \\mid s_t = i \;\\sim\; N\\!\\left(\\left(\\mu_i - \\tfrac{\\sigma_i^2}{2}\\right)\\Delta t,\; \\sigma_i^2 \\Delta t\\right)"}
                description="Conditionally normal within a regime; a mixture of normals unconditionally."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Transition matrix" subtitle="Row i gives the probabilities of where the chain goes next from regime i. Every row sums to 1." />
            <CardBody className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <caption className="mb-2 text-left text-2xs text-ink-faint">
                    P(row → column). The diagonal is the persistence you control.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="px-2 py-1.5 text-left text-2xs uppercase tracking-wider text-ink-faint">
                        From \ To
                      </th>
                      {REGIME_NAMES.map((name, i) => (
                        <th
                          key={name}
                          scope="col"
                          className="px-2 py-1.5 text-right text-2xs uppercase tracking-wider"
                          style={{ color: REGIME_COLORS[i] }}
                        >
                          {name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transition.map((row, i) => (
                      <tr key={i} className="border-t border-line">
                        <th
                          scope="row"
                          className="px-2 py-1.5 text-left text-xs font-medium"
                          style={{ color: REGIME_COLORS[i] }}
                        >
                          {REGIME_NAMES[i]}
                        </th>
                        {row.map((p, j) => (
                          <td
                            key={j}
                            className={`tabular px-2 py-1.5 text-right ${i === j ? "font-semibold text-ink" : "text-ink-muted"}`}
                          >
                            {p.toFixed(3)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Callout tone="accent" title="Persistence is what makes a regime detectable">
                <p>
                  Run length in a state is geometrically distributed, so the expected duration is{" "}
                  <InlineMath>{"1/(1 - P_{ii})"}</InlineMath>. At{" "}
                  <InlineMath>{"P_{ii} = 0.97"}</InlineMath> that is 33 days; at 0.5 it is 2 days.
                </p>
                <p>
                  This matters enormously. A regime that lasts two days cannot be detected from a 40-day
                  rolling window — by the time the statistic responds, the state has changed many times. Drag
                  the persistence sliders down and watch the detection accuracy below collapse toward the
                  always-guess-the-most-common baseline.
                </p>
              </Callout>
            </CardBody>
          </Card>
        </div>

        <ResearchOnly>
          <Card className="mt-4">
            <CardHeader
              title="Stationary distribution"
              subtitle="The long-run fraction of time the chain spends in each state, found by iterating π = πP to convergence."
            />
            <CardBody>
              <DataTable
                columns={["Regime", "Observed occupancy", "Stationary π", "Expected duration", "Realised drift", "Target drift", "Realised σ", "Target σ"]}
                align={["left", "right", "right", "right", "right", "right", "right", "right"]}
                caption="Observed occupancy converges to π only over long runs. Any gap here is finite-sample noise, not a bug — and seeing how large it is at your chosen horizon is itself the lesson."
                rows={perRegimeStats.map((stat) => [
                  <span key={stat.name} style={{ color: REGIME_COLORS[stat.state] }}>{stat.name}</span>,
                  percent(stat.occupancy, 1),
                  percent(stat.stationary, 1),
                  `${stat.expectedDuration.toFixed(0)}d`,
                  percent(stat.realisedDrift, 1),
                  percent(stat.targetDrift, 1),
                  percent(stat.realisedVol, 1),
                  percent(stat.targetVol, 1),
                ])}
              />
            </CardBody>
          </Card>
        </ResearchOnly>
      </ExperimentSection>

      {/* ---------------- Assumptions ---------------- */}
      <ExperimentSection kind="assumptions">
        <Card>
          <CardBody>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[
                { title: "A finite, known number of regimes", body: "Exactly three states exist. Real markets do not come labelled, and choosing the number of states is itself a modelling decision with no obviously right answer." },
                { title: "Constant parameters within a regime", body: "Each regime's drift and volatility never change while it is active. A real 'bull market' is not internally homogeneous." },
                { title: "Constant transition probabilities", body: "The matrix never changes. In practice, the probability of a crash is itself time-varying and depends on conditions the model cannot see." },
                { title: "Instant, discrete switching", body: "The regime flips between one day and the next. Real transitions are gradual, and the question 'when did the bear market start?' rarely has a clean answer." },
                { title: "The Markov property", body: "Only the current state matters; how long you have already been in it does not. Real regime durations may have hazard rates that rise or fall with age, which a plain Markov chain cannot represent." },
                { title: "Conditionally normal returns", body: "Within a regime, returns are Gaussian. The fat tails here come from mixing regimes, not from genuinely fat-tailed shocks." },
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

      {/* ---------------- Detection challenge ---------------- */}
      <ExperimentSection kind="results" title="Challenge: can you infer the hidden state?">
        <Card>
          <CardHeader
            title="A deliberately crude detector"
            subtitle="Classify each day using only observable data: trailing volatility and trailing return."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-3 text-xs leading-relaxed text-ink-muted sm:grid-cols-3">
              <div className="rounded-card border border-line bg-surface-sunken px-3 py-2">
                <p className="font-semibold" style={{ color: REGIME_COLORS[1] }}>Guess Bear</p>
                <p className="mt-1">if trailing volatility exceeds 1.25× its own average</p>
              </div>
              <div className="rounded-card border border-line bg-surface-sunken px-3 py-2">
                <p className="font-semibold" style={{ color: REGIME_COLORS[0] }}>Guess Bull</p>
                <p className="mt-1">otherwise, if the trailing annualised return exceeds +4%</p>
              </div>
              <div className="rounded-card border border-line bg-surface-sunken px-3 py-2">
                <p className="font-semibold" style={{ color: REGIME_COLORS[2] }}>Guess Sideways</p>
                <p className="mt-1">in every remaining case</p>
              </div>
            </div>

            {detection ? (
              <>
                <MetricGrid className="sm:grid-cols-3 lg:grid-cols-3">
                  <MetricCard
                    label="Detector accuracy"
                    value={percent(detection.accuracy, 1)}
                    tone={detection.accuracy > detection.baseline ? "positive" : "negative"}
                    hint="Fraction of days where the guessed regime matched the true hidden regime."
                  />
                  <MetricCard
                    label="Always-guess baseline"
                    value={percent(detection.baseline, 1)}
                    hint="What you would score by ignoring the data entirely and always naming the most common regime. Any detector that cannot beat this has learned nothing."
                  />
                  <MetricCard
                    label="Improvement over baseline"
                    value={`${((detection.accuracy - detection.baseline) * 100).toFixed(1)} pp`}
                    tone={detection.accuracy - detection.baseline > 0.02 ? "positive" : "caution"}
                  />
                </MetricGrid>

                <DataTable
                  columns={["True regime", "Guessed Bull", "Guessed Bear", "Guessed Sideways", "Recall"]}
                  align={["left", "right", "right", "right", "right"]}
                  caption="Confusion matrix. Rows are the truth, columns are the detector's guess. The diagonal is what it got right; everything off-diagonal is a specific kind of mistake."
                  rows={detection.confusion.map((row, i) => {
                    const total = row.reduce((a, b) => a + b, 0);
                    return [
                      <span key={i} style={{ color: REGIME_COLORS[i] }}>{REGIME_NAMES[i]}</span>,
                      ...row.map((count, j) => (
                        <span key={j} className={i === j ? "font-semibold text-ink" : undefined}>
                          {integer(count)}
                        </span>
                      )),
                      total > 0 ? percent(row[i] / total, 1) : "—",
                    ];
                  })}
                />

                <FindingBlock
                  observation={
                    <>
                      With a {params.detectionWindow}-day window and persistence values of{" "}
                      {params.bullPersistence.toFixed(2)} / {params.bearPersistence.toFixed(2)} /{" "}
                      {params.sidewaysPersistence.toFixed(2)}, this detector identified the correct regime on{" "}
                      <strong className="text-ink">{percent(detection.accuracy, 1)}</strong> of days, against a
                      baseline of {percent(detection.baseline, 1)} from always guessing the most common state —{" "}
                      {detection.accuracy >= detection.baseline ? (
                        <>an improvement of {((detection.accuracy - detection.baseline) * 100).toFixed(1)} percentage points.</>
                      ) : (
                        <>
                          <strong className="text-negative">
                            {((detection.baseline - detection.accuracy) * 100).toFixed(1)} percentage points worse
                          </strong>
                          . Meanwhile its recall on Bear regimes was{" "}
                          {percent(
                            detection.confusion[1][1] /
                              Math.max(1, detection.confusion[1].reduce((a, b) => a + b, 0)),
                            1,
                          )}
                          , well above the {percent(simulation.occupancy[1], 1)} of days that are actually Bear.
                        </>
                      )}
                    </>
                  }
                  interpretation={
                    <>
                      <p>
                        Read the confusion matrix, not the headline. Volatility is a genuinely usable signal:
                        bear regimes here carry {percent(params.bearVol, 0)} volatility against{" "}
                        {percent(params.bullVol, 0)} for bull, a gap a rolling estimate can resolve, and the
                        detector finds them at a rate well above their base rate. Drift is not usable:
                        separating a {percent(params.bullDrift, 0)} drift from{" "}
                        {percent(params.sidewaysDrift, 0)} would take many years of data at these volatilities,
                        so Bull and Sideways are confused constantly.
                      </p>
                      {detection.accuracy < detection.baseline ? (
                        <p className="mt-2">
                          The accuracy figure falls below the baseline because{" "}
                          <strong className="text-ink">accuracy is a bad metric for an imbalanced problem</strong>.
                          The detector trades a large number of correct majority-class guesses for a smaller
                          number of correct minority-class guesses. A model that never predicted Bear at all
                          would score <em>higher</em> accuracy while being useless for the one state anybody
                          cares about identifying. This is exactly why classification work reports recall,
                          precision and per-class performance rather than a single accuracy number.
                        </p>
                      ) : null}
                    </>
                  }
                  conclusion={
                    <>
                      Second moments are estimable from short samples; first moments are not. Any regime
                      detector built on returns alone is attempting the harder of the two problems — and
                      whether it looks successful depends heavily on which metric you choose to report.
                    </>
                  }
                  limitation={
                    <>
                      This detector is crude by design, with hand-picked thresholds and no fitting of any kind;
                      a hidden Markov model estimated by Baum-Welch would do considerably better. More
                      fundamentally, the accuracy number is computable here only because the data is synthetic
                      and we know the answer. On real data there is no ground truth, so the central claim of
                      any live regime-detection system cannot be scored at the moment it would be useful.
                    </>
                  }
                                />
              </>
            ) : null}
          </CardBody>
        </Card>
      </ExperimentSection>

      {/* ---------------- Interpretation ---------------- */}
      <ExperimentSection kind="interpretation">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Why regime switching matters" />
            <CardBody className="space-y-2.5 text-xs leading-relaxed text-ink-muted">
              <p>
                <strong className="text-ink">It produces fat tails from Gaussian parts.</strong> Each regime
                here is perfectly normal. The mixture is not: this run has excess kurtosis of{" "}
                {ratio(kurtosis(simulation.returns), 2)}, where a normal distribution would give 0. Mixing
                distributions with different variances is one of the simplest mechanisms that generates the
                heavy tails observed in real returns.
              </p>
              <p>
                <strong className="text-ink">It produces volatility clustering.</strong> Because regimes
                persist, high-volatility days bunch together. That is the most robust empirical regularity in
                all of finance, and it falls straight out of persistence.
              </p>
              <p>
                <strong className="text-ink">It makes &ldquo;the&rdquo; expected return ill-defined.</strong>{" "}
                There is no single μ here — there are three, and which one applies depends on an unobservable
                state. A model estimated on a sample dominated by one regime will mislead badly in another.
              </p>
              <p>
                <strong className="text-ink">It is the foundation for the distribution-shift research.</strong>{" "}
                An agent trained in one regime mixture and evaluated in another is facing exactly the problem
                the research section sets out to study.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Experiments worth running here" />
            <CardBody>
              <ol className="space-y-2.5 text-xs leading-relaxed text-ink-muted">
                {[
                  "Set every persistence to 0.5 and re-check the detector. Accuracy should collapse to roughly the baseline, because a regime that changes every other day leaves no trace in any rolling window.",
                  "Set bear volatility equal to bull volatility, keeping the drifts different. Detection should fall sharply — proof that the detector is really a volatility detector.",
                  "Push bull persistence to 0.995 and run 20 years. Notice how much of the sample a single regime can occupy, and how misleading statistics estimated from that sample would be.",
                  "Hide the regimes, pick a day, and guess the state yourself before revealing it. This is a surprisingly good calibration exercise for how confident you should be about 'we are in a bear market'.",
                  "Change only the seed. Everything about the model is identical, yet the price path is unrecognisable — a useful reminder of how much of any single history is luck.",
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

      {/* ---------------- Limitations ---------------- */}
      <ExperimentSection kind="limitations">
        <Callout tone="caution" title="What this does not establish">
          <p>
            That a three-state Markov model can <em>generate</em> realistic-looking price behaviour does not
            mean real markets <em>are</em> a three-state Markov model. Many different processes produce fat
            tails and volatility clustering, and matching those two features is a very low bar. This is a
            demonstration of a sufficient mechanism, not evidence of the actual one.
          </p>
          <p>
            The detection accuracy reported above is measurable only because we generated the hidden states
            ourselves. On real data the ground truth does not exist, which means the central claim of any
            real-world regime-detection system — &ldquo;we are currently in regime X&rdquo; — cannot be
            verified at the time it matters, only argued about afterwards.
          </p>
          <p>
            Finally, note the selection effect built into the question. Being able to identify regimes in
            hindsight is easy and nearly useless. The useful version is identifying them in real time, with
            only the data available up to that moment — which is what the detector above does, and why it
            performs so much worse than a chart with the answer painted on it suggests it should.
          </p>
        </Callout>
      </ExperimentSection>

      <ReproducibilityPanel
        title="Market Regime Simulator"
        prefix="REG"
        config={config}
        labels={REGIME_LABELS}
        basePath="/labs/market-regimes"
        exports={[
          {
            label: "Export series (CSV)",
            filename: `quantlab-regimes-${params.seed}.csv`,
            mime: "text/csv",
            build: () =>
              toCSV(
                simulation.returns.map((r, i) => ({
                  day: i,
                  price: simulation.prices[i + 1].toFixed(6),
                  return: r.toFixed(8),
                  true_regime: REGIME_NAMES[simulation.regimes[i]],
                  rolling_volatility: rollingVol[i] === null ? "" : rollingVol[i]!.toFixed(6),
                  detected_regime:
                    detection && detection.guesses[i] !== null ? REGIME_NAMES[detection.guesses[i]!] : "",
                })),
              ),
          },
          {
            label: "Export configuration (JSON)",
            filename: `quantlab-regimes-${params.seed}.json`,
            mime: "application/json",
            build: () =>
              JSON.stringify(
                {
                  experiment: "Market Regime Simulator",
                  model: "Three-state Markov-switching geometric Brownian motion",
                  parameters: config,
                  transition_matrix: transition,
                  stationary_distribution: stationary,
                  observed_occupancy: simulation.occupancy,
                  detection: detection
                    ? { accuracy: detection.accuracy, baseline: detection.baseline, confusion: detection.confusion }
                    : null,
                  note: "Synthetic data generated in-browser. Hidden states are known only because this simulation created them.",
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
