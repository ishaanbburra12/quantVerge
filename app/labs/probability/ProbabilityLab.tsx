"use client";

import { useMemo, useState } from "react";
import { useDebounced } from "@/lib/hooks/useBatchedSimulation";
import {
  Button, Callout, Card, CardBody, CardHeader, MetricCard, MetricGrid,
  SliderControl, NumberField, SelectField, DataTable, Tabs,
} from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";
import { ExperimentSection, FindingBlock } from "@/components/labs/ExperimentSection";
import { LabShell, ReproducibilityPanel } from "@/components/labs/LabShell";
import { MultiLineChart, HistogramChart, SimpleBarChart } from "@/components/charts";
import { mulberry32, normalSampler } from "@/lib/math/random";
import { histogram, normalPDF, binomialPMF } from "@/lib/math/distributions";
import { mean, standardDeviation, skewness, kurtosis } from "@/lib/statistics/descriptive";
import { toCSV } from "@/lib/experiment/config";
import { percent, ratio, integer } from "@/lib/format";
import type { LabMeta } from "@/content/labs";
import {
  PROBABILITY_DEFAULTS, PROBABILITY_LABELS, EXPERIMENT_LABELS,
  type ProbabilityParams, type Experiment,
} from "@/lib/labs/probability";

export function ProbabilityLab({ lab, initialParams }: { lab: LabMeta; initialParams: ProbabilityParams }) {
  const [liveParams, setParams] = useState<ProbabilityParams>(initialParams);
  /**
   * `liveParams` updates on every mousemove so the slider thumb tracks the
   * finger. Everything downstream — the simulation AND the chart props — reads
   * the debounced copy instead, so dragging triggers one recompute and one chart
   * render rather than one per pixel. The chart captions are also more honest
   * this way: they describe the parameters that were actually simulated, not a
   * value the slider is still travelling through.
   */
  const params = useDebounced(liveParams, 160);

  const update = <K extends keyof ProbabilityParams>(key: K, value: ProbabilityParams[K]) =>
    setParams((previous) => ({ ...previous, [key]: value }));

  /* ---------------- Coin flips / law of large numbers ---------------- */
  const coin = useMemo(() => {
    const rng = mulberry32(params.seed);
    const runningProportion: number[] = [];
    const upperBand: number[] = [];
    const lowerBand: number[] = [];
    let heads = 0;
    for (let i = 1; i <= params.trials; i++) {
      if (rng() < params.probability) heads += 1;
      runningProportion.push(heads / i);
      // Theoretical ±1.96 standard error band for the running proportion.
      const se = Math.sqrt((params.probability * (1 - params.probability)) / i);
      upperBand.push(params.probability + 1.96 * se);
      lowerBand.push(params.probability - 1.96 * se);
    }
    return { runningProportion, upperBand, lowerBand, heads, final: heads / params.trials };
  }, [params.seed, params.trials, params.probability]);

  /** Checkpoints at powers of ten, which is how the convergence is usually quoted. */
  const coinCheckpoints = useMemo(() => {
    const points = [10, 100, 1000, 10000, 100000].filter((n) => n <= params.trials);
    return points.map((n) => ({
      trials: n,
      observed: coin.runningProportion[n - 1],
      error: Math.abs(coin.runningProportion[n - 1] - params.probability),
      standardError: Math.sqrt((params.probability * (1 - params.probability)) / n),
    }));
  }, [coin, params.trials, params.probability]);

  /* ---------------- Dice ---------------- */
  const dice = useMemo(() => {
    const rng = mulberry32(params.seed);
    const sums: number[] = [];
    const counts = new Array(11).fill(0);
    for (let i = 0; i < params.trials; i++) {
      const a = 1 + Math.floor(rng() * 6);
      const b = 1 + Math.floor(rng() * 6);
      sums.push(a + b);
      counts[a + b - 2] += 1;
    }
    // Exact probabilities for the sum of two fair dice.
    const exact = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1].map((w) => w / 36);
    return {
      sums,
      observed: counts.map((c) => c / params.trials),
      exact,
      mean: mean(sums),
      sd: standardDeviation(sums, 1),
    };
  }, [params.seed, params.trials]);

  /* ---------------- Central limit theorem ---------------- */
  const clt = useMemo(() => {
    const rng = mulberry32(params.seed);
    const normal = normalSampler(mulberry32(params.seed + 101));

    /**
     * Draw one observation from the chosen source distribution.
     * All are normalised to mean 0 and variance 1, so the only thing that
     * differs between them is SHAPE — which is exactly what the CLT claims does
     * not matter once you average enough of them.
     */
    const draw = (): number => {
      switch (params.sourceDistribution) {
        case "uniform":
          // Uniform(0,1) has mean 1/2 and variance 1/12.
          return (rng() - 0.5) * Math.sqrt(12);
        case "exponential": {
          // Exponential(1) has mean 1 and variance 1; heavily right-skewed.
          let u = rng();
          while (u <= Number.EPSILON) u = rng();
          return -Math.log(u) - 1;
        }
        case "bernoulli":
          // A two-point distribution — as far from normal as it gets.
          return rng() < 0.5 ? -1 : 1;
        default: {
          // Bimodal: two separated clusters.
          const side = rng() < 0.5 ? -1 : 1;
          return (side * 1.6 + normal() * 0.6) / Math.sqrt(1.6 * 1.6 + 0.36);
        }
      }
    };

    const rawSamples: number[] = [];
    const sampleMeans: number[] = [];
    const meanCount = Math.min(6000, Math.max(600, Math.floor(params.trials / 2)));

    for (let i = 0; i < meanCount; i++) {
      let total = 0;
      for (let j = 0; j < params.sampleSize; j++) {
        const value = draw();
        total += value;
        if (rawSamples.length < 6000) rawSamples.push(value);
      }
      // The standardised sample mean: multiply by sqrt(n) so the distribution
      // keeps unit variance as n grows, which is what makes the convergence to a
      // FIXED normal visible rather than a collapsing spike.
      sampleMeans.push((total / params.sampleSize) * Math.sqrt(params.sampleSize));
    }

    return {
      rawSamples,
      sampleMeans,
      rawSkew: skewness(rawSamples),
      rawKurtosis: kurtosis(rawSamples),
      meanSkew: skewness(sampleMeans),
      meanKurtosis: kurtosis(sampleMeans),
      meanOfMeans: mean(sampleMeans),
      sdOfMeans: standardDeviation(sampleMeans, 1),
    };
  }, [params.seed, params.sampleSize, params.sourceDistribution, params.trials]);

  /* ---------------- Bayes ---------------- */
  const bayes = useMemo(() => {
    const { prior, sensitivity, specificity } = params;
    const falsePositiveRate = 1 - specificity;
    // P(+) = P(+|D)P(D) + P(+|~D)P(~D)
    const marginal = sensitivity * prior + falsePositiveRate * (1 - prior);
    const posterior = marginal > 0 ? (sensitivity * prior) / marginal : 0;

    // Natural frequencies out of 100,000 people — far more intuitive than the
    // probabilities, and the standard fix for base-rate neglect.
    const population = 100000;
    const withDisease = Math.round(population * prior);
    const healthy = population - withDisease;
    const truePositives = Math.round(withDisease * sensitivity);
    const falsePositives = Math.round(healthy * falsePositiveRate);

    return {
      posterior,
      marginal,
      truePositives,
      falsePositives,
      withDisease,
      healthy,
      population,
      totalPositives: truePositives + falsePositives,
    };
  }, [params]);

  const config: Record<string, number | string> = { ...params };

  return (
    <LabShell
      lab={lab}
      question="How do the two theorems that everything else in quantitative finance rests on — the law of large numbers and the central limit theorem — actually behave when you watch them happen?"
    >
      <ExperimentSection kind="inputs">
        <Tabs
          ariaLabel="Experiment"
          active={params.experiment}
          onChange={(v) => update("experiment", v as Experiment)}
          tabs={(Object.keys(EXPERIMENT_LABELS) as Experiment[]).map((e) => ({
            value: e, label: EXPERIMENT_LABELS[e],
          }))}
        />

        <div className="mt-4 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Controls" />
            <CardBody className="space-y-4">
              {params.experiment === "coin" || params.experiment === "lln" ? (
                <SliderControl
                  label="P(heads)"
                  value={liveParams.probability}
                  min={0} max={1} step={0.01}
                  onChange={(v) => update("probability", v)}
                  format={(v) => v.toFixed(2)}
                  hint="The true bias of the coin. The law of large numbers says the observed proportion converges to this — but says nothing about how fast."
                />
              ) : null}

              {params.experiment === "clt" ? (
                <>
                  <SelectField
                    label="Source distribution"
                    value={liveParams.sourceDistribution}
                    options={[
                      { value: "exponential", label: "Exponential — heavily right-skewed" },
                      { value: "uniform", label: "Uniform — flat" },
                      { value: "bernoulli", label: "Bernoulli — only two values" },
                      { value: "bimodal", label: "Bimodal — two separate clusters" },
                    ]}
                    onChange={(v) => update("sourceDistribution", v)}
                    hint="All four are standardised to mean 0 and variance 1, so only their SHAPE differs. The CLT claims the shape stops mattering once you average enough of them."
                  />
                  <SliderControl
                    label="Sample size n"
                    value={liveParams.sampleSize}
                    min={1} max={100} step={1}
                    onChange={(v) => update("sampleSize", v)}
                    format={(v) => String(v)}
                    hint="How many draws go into each average. Start at 1 to see the raw distribution, then increase and watch the bell curve appear."
                  />
                </>
              ) : null}

              {params.experiment === "bayes" ? (
                <>
                  <SliderControl
                    label="Prior probability"
                    value={liveParams.prior}
                    min={0.0001} max={0.5} step={0.0005}
                    onChange={(v) => update("prior", v)}
                    format={(v) => percent(v, 3)}
                    hint="The base rate: how common the condition is before any test. This is the number people most reliably ignore."
                  />
                  <SliderControl
                    label="Sensitivity P(+ | disease)"
                    value={liveParams.sensitivity}
                    min={0.5} max={0.9999} step={0.001}
                    onChange={(v) => update("sensitivity", v)}
                    format={(v) => percent(v, 2)}
                  />
                  <SliderControl
                    label="Specificity P(− | healthy)"
                    value={liveParams.specificity}
                    min={0.5} max={0.9999} step={0.001}
                    onChange={(v) => update("specificity", v)}
                    format={(v) => percent(v, 2)}
                    hint="How often the test correctly clears a healthy person. One minus this is the false-positive rate, which drives everything when the condition is rare."
                  />
                </>
              ) : null}

              {params.experiment !== "bayes" ? (
                <SliderControl
                  label="Trials"
                  value={liveParams.trials}
                  min={10} max={100000} step={10}
                  onChange={(v) => update("trials", v)}
                  format={(v) => integer(v)}
                />
              ) : null}

              <NumberField
                label="Random seed"
                value={liveParams.seed}
                onChange={(v) => update("seed", Math.max(0, Math.floor(v)))}
                min={0} step={1}
              />
              <div className="flex gap-2 border-t border-line pt-3">
                <Button size="sm" onClick={() => update("seed", Math.floor(Math.random() * 1_000_000))}>
                  New seed
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setParams({ ...PROBABILITY_DEFAULTS, experiment: params.experiment })}>
                  Reset
                </Button>
              </div>
            </CardBody>
          </Card>

          <div className="space-y-4">
            {/* ---------- Coin / LLN ---------- */}
            {params.experiment === "coin" || params.experiment === "lln" ? (
              <>
                <MetricGrid>
                  <MetricCard label="Heads" value={integer(coin.heads)} />
                  <MetricCard label="Observed proportion" value={ratio(coin.final, 5)} />
                  <MetricCard label="True probability" value={ratio(params.probability, 5)} />
                  <MetricCard
                    label="Absolute error"
                    value={ratio(Math.abs(coin.final - params.probability), 5)}
                    tone={Math.abs(coin.final - params.probability) < 2 * Math.sqrt((params.probability * (1 - params.probability)) / params.trials) ? "positive" : "caution"}
                    footnote={`1 SE = ${ratio(Math.sqrt((params.probability * (1 - params.probability)) / params.trials), 5)}`}
                  />
                </MetricGrid>

                <Card>
                  <CardHeader
                    title="The running proportion"
                    subtitle="The observed frequency against the true probability, with a ±1.96 standard-error band."
                  />
                  <CardBody>
                    <MultiLineChart
                      series={[
                        { key: "observed", label: "Observed proportion", values: coin.runningProportion, color: "var(--series-1)", width: 1.8 },
                        { key: "upper", label: "±1.96 standard errors", values: coin.upperBand, color: "var(--accent-muted)", dashed: true },
                        { key: "lower", label: "", values: coin.lowerBand, color: "var(--accent-muted)", dashed: true },
                      ]}
                      title="Convergence of the observed proportion"
                      description="The running proportion of heads swings wildly at first and settles toward the true probability, staying mostly inside a band that narrows as the square root of the number of trials."
                      xLabel="Trials"
                      yLabel="Proportion"
                      formatY={(v) => v.toFixed(3)}
                      referenceY={params.probability}
                      referenceYLabel="True p"
                      height={320}
                      footnote="The band narrows as 1/√n, not as 1/n. That is why the first hundred trials improve the estimate far more than the next nine hundred."
                    />
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Convergence at powers of ten" />
                  <CardBody>
                    <DataTable
                      columns={["Trials", "Observed proportion", "Error", "1 standard error", "Error in SEs"]}
                      align={["right", "right", "right", "right", "right"]}
                      caption="The error shrinks, but slowly: each tenfold increase in trials buys only about a threefold reduction."
                      rows={coinCheckpoints.map((c) => [
                        integer(c.trials),
                        ratio(c.observed, 5),
                        ratio(c.error, 5),
                        ratio(c.standardError, 5),
                        ratio(c.error / c.standardError, 2),
                      ])}
                    />
                  </CardBody>
                </Card>

                <Callout tone="caution" title="What the law of large numbers does NOT say">
                  <p>
                    It says the <em>proportion</em> converges to p. It does not say the <em>count</em> of heads
                    and tails evens out — in fact the absolute difference between them typically <em>grows</em>,
                    roughly like <InlineMath>{"\\sqrt{n}"}</InlineMath>. In this run the difference is{" "}
                    {integer(Math.abs(2 * coin.heads - params.trials))}.
                  </p>
                  <p>
                    The belief that a run of tails makes heads &ldquo;due&rdquo; is the gambler&rsquo;s fallacy,
                    and it survives because people half-remember this theorem. The coin has no memory. The
                    proportion converges not because past deviations are corrected, but because they are
                    diluted by an ever-growing denominator.
                  </p>
                </Callout>
              </>
            ) : null}

            {/* ---------- Dice ---------- */}
            {params.experiment === "dice" ? (
              <>
                <MetricGrid>
                  <MetricCard label="Observed mean" value={ratio(dice.mean, 4)} footnote="Theoretical: 7" />
                  <MetricCard label="Observed std dev" value={ratio(dice.sd, 4)} footnote="Theoretical: 2.4152" />
                  <MetricCard label="Rolls" value={integer(params.trials)} />
                  <MetricCard
                    label="Max deviation from exact"
                    value={ratio(Math.max(...dice.observed.map((o, i) => Math.abs(o - dice.exact[i]))), 5)}
                  />
                </MetricGrid>

                <Card>
                  <CardHeader title="Sum of two dice" subtitle="Observed frequencies against the exact probabilities." />
                  <CardBody>
                    <SimpleBarChart
                      data={dice.observed.map((o, i) => ({ sum: String(i + 2), observed: o, exact: dice.exact[i] }))}
                      xKey="sum"
                      bars={[
                        { key: "observed", label: "Observed", color: "var(--series-1)" },
                        { key: "exact", label: "Exact probability", color: "var(--series-2)" },
                      ]}
                      title="Distribution of the sum of two dice"
                      description="Paired bars showing observed frequency against exact probability for each possible sum from 2 to 12, forming a symmetric triangle peaking at 7."
                      formatY={(v) => v.toFixed(3)}
                      height={280}
                      footnote="The triangular shape appears because 7 can be made six different ways (1+6, 2+5, 3+4, 4+3, 5+2, 6+1) while 2 and 12 can each be made only one way."
                    />
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Why the shape is triangular" />
                  <CardBody>
                    <DataTable
                      columns={["Sum", "Ways to make it", "Exact probability", "Observed", "Difference"]}
                      align={["right", "right", "right", "right", "right"]}
                      rows={dice.exact.map((p, i) => [
                        integer(i + 2),
                        integer(Math.round(p * 36)),
                        `${Math.round(p * 36)}/36 = ${ratio(p, 4)}`,
                        ratio(dice.observed[i], 4),
                        ratio(dice.observed[i] - p, 4),
                      ])}
                      caption="Each of the 36 equally likely outcomes is counted once. Probability is just counting, when the outcomes are equally likely."
                    />
                  </CardBody>
                </Card>
              </>
            ) : null}

            {/* ---------- CLT ---------- */}
            {params.experiment === "clt" ? (
              <>
                <MetricGrid>
                  <MetricCard
                    label="Source skewness"
                    value={ratio(clt.rawSkew, 3)}
                    tone={Math.abs(clt.rawSkew) > 0.5 ? "caution" : "neutral"}
                    hint="How asymmetric the raw distribution is. A normal distribution has skewness 0."
                  />
                  <MetricCard
                    label="Sample-mean skewness"
                    value={ratio(clt.meanSkew, 3)}
                    tone={Math.abs(clt.meanSkew) < 0.2 ? "positive" : "caution"}
                    hint="The same measure, applied to the averages. It should shrink toward zero as n grows."
                  />
                  <MetricCard label="Source excess kurtosis" value={ratio(clt.rawKurtosis, 3)} />
                  <MetricCard
                    label="Sample-mean excess kurtosis"
                    value={ratio(clt.meanKurtosis, 3)}
                    tone={Math.abs(clt.meanKurtosis) < 0.3 ? "positive" : "caution"}
                  />
                </MetricGrid>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader title="The source distribution" subtitle="Individual draws, standardised to mean 0 and variance 1." />
                    <CardBody>
                      <HistogramChart
                        bins={histogram(clt.rawSamples, 44)}
                        title="Source distribution"
                        description={`Histogram of individual draws from the ${params.sourceDistribution} distribution. Its shape is visibly not normal.`}
                        xLabel="Value"
                        formatX={(v) => v.toFixed(1)}
                        height={260}
                        footnote={`Skewness ${ratio(clt.rawSkew, 2)}, excess kurtosis ${ratio(clt.rawKurtosis, 2)}. This is what we are averaging.`}
                      />
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader
                      title={`Distribution of sample means (n = ${params.sampleSize})`}
                      subtitle="With the standard normal density overlaid."
                    />
                    <CardBody>
                      <HistogramChart
                        bins={histogram(clt.sampleMeans, 44)}
                        overlay={Array.from({ length: 200 }, (_, i) => {
                          const x = -4 + (8 * i) / 199;
                          return { x, y: normalPDF(x, 0, 1) };
                        })}
                        title="Distribution of standardised sample means"
                        description={`Histogram of ${integer(clt.sampleMeans.length)} standardised sample means, each formed from ${params.sampleSize} draws, with the standard normal density drawn on top.`}
                        xLabel="Standardised sample mean"
                        formatX={(v) => v.toFixed(1)}
                        height={260}
                        footnote={`Skewness ${ratio(clt.meanSkew, 2)}, excess kurtosis ${ratio(clt.meanKurtosis, 2)}. Compare with the source distribution to the left.`}
                      />
                    </CardBody>
                  </Card>
                </div>

                <FindingBlock
                  observation={
                    <>
                      Averaging {params.sampleSize} draws from a distribution with skewness{" "}
                      {ratio(clt.rawSkew, 2)} and excess kurtosis {ratio(clt.rawKurtosis, 2)} produced sample
                      means with skewness <strong className="text-ink">{ratio(clt.meanSkew, 2)}</strong> and
                      excess kurtosis <strong className="text-ink">{ratio(clt.meanKurtosis, 2)}</strong> — both
                      far closer to the normal distribution&rsquo;s values of zero.
                    </>
                  }
                  interpretation={
                    <>
                      This is the central limit theorem happening. The skewness of a sample mean shrinks like{" "}
                      <InlineMath>{"1/\\sqrt{n}"}</InlineMath> and the excess kurtosis like{" "}
                      <InlineMath>{"1/n"}</InlineMath>, so asymmetry disappears slowly and tail-heaviness
                      disappears faster. Set n = 1 and the two histograms are identical; raise it and watch the
                      bell curve assemble itself out of a distribution that looks nothing like one.
                    </>
                  }
                  conclusion={
                    <>
                      The normal distribution is not an assumption people make out of convenience. It is what
                      you get whenever a quantity is an <em>average</em> or a <em>sum</em> of many independent
                      contributions — which is why it appears throughout finance, where returns aggregate over
                      time and across holdings.
                    </>
                  }
                  limitation={
                    <>
                      The CLT requires independence and finite variance, and it describes the <em>centre</em> of
                      the distribution far better than the tails. Convergence in the extreme tail is much slower
                      than in the body, so a rare event can be badly mispriced by a normal approximation even
                      when n is large. Financial returns also violate independence, which is precisely why
                      market returns remain fat-tailed no matter how long you average.
                    </>
                  }
                />
              </>
            ) : null}

            {/* ---------- Bayes ---------- */}
            {params.experiment === "bayes" ? (
              <>
                <MetricGrid className="sm:grid-cols-2 lg:grid-cols-3">
                  <MetricCard
                    label="Posterior P(disease | +)"
                    value={percent(bayes.posterior, 2)}
                    tone={bayes.posterior < 0.5 ? "caution" : "neutral"}
                    hint="The probability that someone who tested positive actually has the condition. Almost everyone's intuition puts this far too high."
                  />
                  <MetricCard label="Prior P(disease)" value={percent(params.prior, 3)} />
                  <MetricCard label="Test sensitivity" value={percent(params.sensitivity, 2)} />
                  <MetricCard label="False-positive rate" value={percent(1 - params.specificity, 2)} />
                  <MetricCard label="P(positive test)" value={percent(bayes.marginal, 2)} />
                  <MetricCard
                    label="Posterior odds"
                    value={`${ratio(bayes.posterior / Math.max(1e-9, 1 - bayes.posterior), 3)} : 1`}
                  />
                </MetricGrid>

                <Card>
                  <CardHeader
                    title="The same problem in natural frequencies"
                    subtitle="Out of 100,000 people. This framing is dramatically easier to reason about than probabilities, and the reason is well documented."
                  />
                  <CardBody className="space-y-3">
                    <DataTable
                      columns={["Group", "People", "Test positive", "Test negative"]}
                      align={["left", "right", "right", "right"]}
                      rows={[
                        [
                          <span key="d" className="text-negative">Has the condition</span>,
                          integer(bayes.withDisease),
                          integer(bayes.truePositives),
                          integer(bayes.withDisease - bayes.truePositives),
                        ],
                        [
                          <span key="h" className="text-positive">Healthy</span>,
                          integer(bayes.healthy),
                          integer(bayes.falsePositives),
                          integer(bayes.healthy - bayes.falsePositives),
                        ],
                        [
                          <strong key="t" className="text-ink">Total</strong>,
                          integer(bayes.population),
                          <strong key="tp" className="text-ink">{integer(bayes.totalPositives)}</strong>,
                          integer(bayes.population - bayes.totalPositives),
                        ],
                      ]}
                      caption="Read the 'test positive' column: of everyone who tests positive, only the first row actually has the condition."
                    />

                    <Callout tone="accent" title={`Of ${integer(bayes.totalPositives)} positive tests, only ${integer(bayes.truePositives)} are real`}>
                      <p>
                        That is {percent(bayes.posterior, 1)} — even though the test correctly identifies{" "}
                        {percent(params.sensitivity, 1)} of true cases and correctly clears{" "}
                        {percent(params.specificity, 1)} of healthy people.
                      </p>
                      <p>
                        The reason is the base rate. There are so many more healthy people that even a small
                        false-positive rate applied to {integer(bayes.healthy)} of them produces{" "}
                        {integer(bayes.falsePositives)} false alarms, which can easily swamp the{" "}
                        {integer(bayes.truePositives)} genuine detections. Ignoring this is called{" "}
                        <strong className="text-ink">base-rate neglect</strong>, and it is one of the most
                        robust findings in cognitive psychology.
                      </p>
                      <p>
                        The same structure governs strategy discovery. If genuinely profitable strategies are
                        rare and your backtest has any false-positive rate at all, most strategies that pass
                        your test will be false — which is the Overfitting Lab&rsquo;s lesson, restated as a
                        probability problem.
                      </p>
                    </Callout>
                  </CardBody>
                </Card>
              </>
            ) : null}
          </div>
        </div>
      </ExperimentSection>

      {/* ---------------- Model ---------------- */}
      <ExperimentSection kind="model" title="The mathematics">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Expectation, variance, and the two limit theorems" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="Expected value"
                equation={"E[X] = \\sum_i x_i P(X = x_i) \\quad\\text{or}\\quad \\int x f(x)\\,dx"}
                description="The probability-weighted average of all outcomes. Not necessarily an outcome you can ever observe — the expected value of one die roll is 3.5."
              />
              <EquationBlock
                label="Variance"
                equation={"\\operatorname{Var}(X) = E\\left[(X - E[X])^2\\right] = E[X^2] - (E[X])^2"}
                description="The average squared distance from the mean. Squaring is what makes deviations in both directions count, and what makes variance add for independent variables."
              />
              <EquationBlock
                label="Law of large numbers"
                equation={"\\bar{X}_n = \\frac{1}{n}\\sum_{i=1}^{n} X_i \;\\xrightarrow{\;n \\to \\infty\;}\; E[X]"}
                description="The sample mean converges to the true mean. It says nothing about the rate — that is what the CLT adds."
              />
              <EquationBlock
                label="Central limit theorem"
                equation={"\\sqrt{n}\\,\\frac{\\bar{X}_n - \\mu}{\\sigma} \;\\xrightarrow{d}\; N(0, 1)"}
                description="Regardless of the shape of X's distribution, the standardised sample mean converges to a standard normal — provided the variance is finite."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Bayes' theorem" />
            <CardBody className="space-y-3">
              <EquationBlock
                equation={"P(H \\mid E) = \\frac{P(E \\mid H)\\,P(H)}{P(E)}"}
                description="How to update a belief when evidence arrives."
                where={[
                  { symbol: "P(H)", meaning: "the prior — how likely the hypothesis was before the evidence" },
                  { symbol: "P(E \\mid H)", meaning: "the likelihood — how probable this evidence is if the hypothesis is true" },
                  { symbol: "P(E)", meaning: "the marginal probability of seeing this evidence at all" },
                  { symbol: "P(H \\mid E)", meaning: "the posterior — the updated belief" },
                ]}
              />
              <EquationBlock
                label="Expanding the denominator"
                equation={"P(E) = P(E \\mid H)P(H) + P(E \\mid \\neg H)P(\\neg H)"}
                description="The law of total probability. The second term is where false positives live, and it is the term that intuition drops."
              />
              <Callout tone="accent" title="Why it matters here">
                <p>
                  Bayes is the formal statement of how evidence should change your mind, and the quantity it
                  forces you to supply is the one people most want to skip: the prior.
                </p>
                <p>
                  &ldquo;This backtest shows a Sharpe of 2&rdquo; is a likelihood. Converting it into
                  &ldquo;this strategy is probably good&rdquo; requires a prior on how common good strategies
                  are — and if that prior is low, a strong-looking result is still most likely a false positive.
                </p>
              </Callout>
            </CardBody>
          </Card>
        </div>
      </ExperimentSection>

      <ExperimentSection kind="limitations">
        <Callout tone="caution" title="Simulation demonstrates; it does not prove">
          <p>
            Watching a histogram turn into a bell curve is persuasive, but it is not a proof of the central
            limit theorem, and no number of simulations would be. The theorem is a statement about a limit,
            and a simulation can only ever show finitely many trials with one particular random seed.
          </p>
          <p>
            What simulation is genuinely good for is building correct intuition about <em>rates</em> — how fast
            convergence actually happens, how much data you need before an estimate is trustworthy, and how
            large a deviation is still ordinary. Those are the questions that matter in practice, and they are
            exactly the ones a proof does not answer.
          </p>
        </Callout>
      </ExperimentSection>

      <ReproducibilityPanel
        title="Probability Playground"
        prefix="PROB"
        config={config}
        labels={PROBABILITY_LABELS}
        basePath="/labs/probability"
        exports={[
          {
            label: "Export data (CSV)",
            filename: `quantlab-probability-${params.experiment}-${params.seed}.csv`,
            mime: "text/csv",
            build: () => {
              if (params.experiment === "clt") {
                return toCSV(clt.sampleMeans.map((m, i) => ({ sample: i, standardised_mean: m.toFixed(8) })));
              }
              if (params.experiment === "dice") {
                return toCSV(dice.sums.map((s, i) => ({ roll: i, sum: s })));
              }
              return toCSV(
                coin.runningProportion.map((p, i) => ({
                  trial: i + 1,
                  running_proportion: p.toFixed(8),
                  theoretical: params.probability,
                })),
              );
            },
          },
        ]}
      />
    </LabShell>
  );
}
