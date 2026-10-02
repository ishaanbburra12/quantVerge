"use client";

import { useMemo, useState } from "react";
import {
  Button, Callout, Card, CardBody, CardHeader, MetricCard, MetricGrid,
  SliderControl, NumberField, DataTable,
} from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";
import { ExperimentSection, FindingBlock, ResearchOnly } from "@/components/labs/ExperimentSection";
import { LabShell, ReproducibilityPanel } from "@/components/labs/LabShell";
import { HistogramChart, MultiLineChart, SimpleBarChart } from "@/components/charts";
import { useDebounced } from "@/lib/hooks/useBatchedSimulation";
import {
  oneSampleTTest, power, requiredSampleSize, bonferroni, benjaminiHochberg,
  familyWiseErrorRate, studentTInverse, sharpeStandardError,
} from "@/lib/statistics/inference";
import { histogram } from "@/lib/math/distributions";
import { seededNormal } from "@/lib/math/random";
import { mean } from "@/lib/statistics/descriptive";
import { toCSV } from "@/lib/experiment/config";
import { percent, ratio, integer, number as fmtNumber } from "@/lib/format";
import type { LabMeta } from "@/content/labs";
import { INFERENCE_DEFAULTS, INFERENCE_LABELS, type InferenceParams } from "@/lib/labs/inference";

export function InferenceLab({ lab, initialParams }: { lab: LabMeta; initialParams: InferenceParams }) {
  const [liveParams, setParams] = useState<InferenceParams>(initialParams);
  const params = useDebounced(liveParams, 160);

  const update = <K extends keyof InferenceParams>(key: K, value: InferenceParams[K]) =>
    setParams((previous) => ({ ...previous, [key]: value }));

  /** One sample, drawn from a population with the true effect you specified. */
  const singleSample = useMemo(() => {
    const normal = seededNormal(params.seed);
    const data = Array.from(
      { length: params.sampleSize },
      () => params.trueEffect + params.populationSd * normal(),
    );
    return { data, test: oneSampleTTest(data, 0, params.alpha) };
  }, [params.seed, params.sampleSize, params.trueEffect, params.populationSd, params.alpha]);

  /**
   * Repeat the whole experiment many times.
   *
   * This is the only way to see what a p-value actually MEANS. A single p-value
   * is one draw from a distribution; running the experiment thousands of times
   * reveals that distribution — uniform under a true null, concentrated near
   * zero under a real effect.
   */
  const replication = useMemo(() => {
    const normal = seededNormal(params.seed + 9176);
    const pValues: number[] = [];
    const estimates: number[] = [];
    let rejections = 0;
    for (let r = 0; r < params.replications; r++) {
      const sample = Array.from(
        { length: params.sampleSize },
        () => params.trueEffect + params.populationSd * normal(),
      );
      const test = oneSampleTTest(sample, 0, params.alpha);
      pValues.push(test.pValue);
      estimates.push(test.sampleMean);
      if (test.rejectAtAlpha) rejections++;
    }
    return {
      pValues,
      estimates,
      rejectionRate: rejections / params.replications,
      // Of the experiments that DID reject, how exaggerated was the effect?
      // This is the "winner's curse" of significance testing.
      meanEstimateWhenSignificant:
        pValues.filter((p) => p < params.alpha).length > 0
          ? mean(estimates.filter((_, i) => pValues[i] < params.alpha).map(Math.abs))
          : 0,
      meanEstimateOverall: mean(estimates.map(Math.abs)),
    };
  }, [params]);

  const standardError = params.populationSd / Math.sqrt(params.sampleSize);
  const theoreticalPower = useMemo(
    () => power(params.trueEffect, standardError, params.alpha),
    [params.trueEffect, standardError, params.alpha],
  );

  /** Power as a function of sample size, at the current effect. */
  const powerCurve = useMemo(() => {
    const sizes: number[] = [];
    const powers: number[] = [];
    for (let n = 5; n <= 500; n += 5) {
      sizes.push(n);
      powers.push(power(params.trueEffect, params.populationSd / Math.sqrt(n), params.alpha));
    }
    return { sizes, powers };
  }, [params.trueEffect, params.populationSd, params.alpha]);

  /** Simultaneous tests, all of a TRUE null, with and without correction. */
  const multipleTesting = useMemo(() => {
    const normal = seededNormal(params.seed + 31337);
    const pValues: number[] = [];
    for (let k = 0; k < params.numberOfTests; k++) {
      // Every one of these is a true null: the mean really is zero.
      const sample = Array.from({ length: params.sampleSize }, () => params.populationSd * normal());
      pValues.push(oneSampleTTest(sample, 0, params.alpha).pValue);
    }
    const uncorrected = pValues.map((p) => p < params.alpha);
    const bonf = bonferroni(pValues, params.alpha);
    const bh = benjaminiHochberg(pValues, params.alpha);
    return {
      pValues,
      uncorrected,
      bonferroni: bonf,
      benjaminiHochberg: bh,
      falsePositivesUncorrected: uncorrected.filter(Boolean).length,
      falsePositivesBonferroni: bonf.filter(Boolean).length,
      falsePositivesBH: bh.filter(Boolean).length,
      expectedFWER: familyWiseErrorRate(params.numberOfTests, params.alpha),
    };
  }, [params.seed, params.numberOfTests, params.sampleSize, params.populationSd, params.alpha]);

  const config: Record<string, number> = { ...params };
  const isNullTrue = Math.abs(params.trueEffect) < 1e-12;

  return (
    <LabShell
      lab={lab}
      question="A result is statistically significant. What does that actually establish — and what does it fail to establish, even when the mathematics is applied perfectly?"
    >
      <ExperimentSection kind="inputs">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="The experiment" subtitle="You set the truth. That is what makes the errors visible." />
            <CardBody className="space-y-4">
              <SliderControl
                label="True effect size"
                value={liveParams.trueEffect}
                min={-1} max={1} step={0.01}
                onChange={(v) => update("trueEffect", v)}
                format={(v) => (Math.abs(v) < 1e-9 ? "0 — null is TRUE" : v.toFixed(2))}
                hint="The real population mean. At exactly 0 the null hypothesis is true, so every rejection below is a false positive by construction — which is the only setting where you can count them."
              />
              <SliderControl
                label="Population std deviation"
                value={liveParams.populationSd}
                min={0.2} max={3} step={0.05}
                onChange={(v) => update("populationSd", v)}
                format={(v) => v.toFixed(2)}
              />
              <SliderControl
                label="Sample size n"
                value={liveParams.sampleSize}
                min={3} max={500} step={1}
                onChange={(v) => update("sampleSize", v)}
                format={(v) => integer(v)}
                hint="Precision improves with the square root of n, so quadrupling the sample halves the standard error."
              />
              <SliderControl
                label="Significance level α"
                value={liveParams.alpha}
                min={0.001} max={0.2} step={0.001}
                onChange={(v) => update("alpha", v)}
                format={(v) => v.toFixed(3)}
                hint="The false-positive rate you are willing to accept when the null is true. Lowering it reduces false positives and reduces power at the same time — there is no setting that improves both."
              />
              <SliderControl
                label="Simultaneous tests"
                value={liveParams.numberOfTests}
                min={1} max={200} step={1}
                onChange={(v) => update("numberOfTests", v)}
                format={(v) => integer(v)}
                hint="How many hypotheses are tested at once. Every one below is a TRUE null, so every rejection is a false positive."
              />
              <SliderControl
                label="Replications"
                value={liveParams.replications}
                min={200} max={8000} step={200}
                onChange={(v) => update("replications", v)}
                format={(v) => integer(v)}
              />
              <NumberField
                label="Random seed"
                value={liveParams.seed}
                onChange={(v) => update("seed", Math.max(0, Math.floor(v)))}
                min={0} step={1}
              />
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <Button size="sm" onClick={() => update("seed", Math.floor(Math.random() * 1_000_000))}>
                  New seed
                </Button>
                <Button size="sm" variant="ghost" onClick={() => update("trueEffect", 0)}>
                  Make null true
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setParams(INFERENCE_DEFAULTS)}>
                  Reset
                </Button>
              </div>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <MetricGrid>
              <MetricCard
                label="Sample mean"
                value={ratio(singleSample.test.sampleMean, 4)}
                footnote={`True value: ${ratio(params.trueEffect, 4)}`}
              />
              <MetricCard
                label="t statistic"
                value={ratio(singleSample.test.statistic, 4)}
                hint="(sample mean − null) ÷ standard error. Note the denominator is the standard error of the MEAN, not the standard deviation of the data."
              />
              <MetricCard
                label="p-value"
                value={singleSample.test.pValue < 0.0001 ? "< 0.0001" : fmtNumber(singleSample.test.pValue, 4)}
                tone={singleSample.test.rejectAtAlpha ? (isNullTrue ? "negative" : "positive") : "neutral"}
                footnote={
                  singleSample.test.rejectAtAlpha
                    ? isNullTrue ? "FALSE POSITIVE — the null is true" : "Correctly rejected"
                    : isNullTrue ? "Correctly retained" : "FALSE NEGATIVE — the effect is real"
                }
              />
              <MetricCard
                label="Statistical power"
                value={percent(theoreticalPower, 1)}
                tone={theoreticalPower > 0.8 ? "positive" : theoreticalPower > 0.5 ? "caution" : "negative"}
                hint="The probability of detecting the effect if it is really there. Below 80% is conventionally considered underpowered; below 50% means you are more likely to miss a real effect than find it."
              />
              <MetricCard label="Standard error" value={ratio(standardError, 4)} />
              <MetricCard
                label={`${percent(1 - params.alpha, 0)} confidence interval`}
                value={`[${ratio(singleSample.test.confidenceInterval[0], 3)}, ${ratio(singleSample.test.confidenceInterval[1], 3)}]`}
                footnote={
                  singleSample.test.confidenceInterval[0] <= params.trueEffect &&
                  singleSample.test.confidenceInterval[1] >= params.trueEffect
                    ? "Contains the true value"
                    : "MISSES the true value"
                }
              />
              <MetricCard
                label="Critical t value"
                value={`±${ratio(studentTInverse(1 - params.alpha / 2, params.sampleSize - 1), 3)}`}
              />
              <MetricCard
                label="n for 80% power"
                value={
                  Math.abs(params.trueEffect) < 1e-9
                    ? "∞"
                    : integer(requiredSampleSize(Math.abs(params.trueEffect), params.populationSd, 0.8, params.alpha))
                }
                hint="How large a sample you would need to have an 80% chance of detecting this effect."
              />
            </MetricGrid>

            <Card>
              <CardHeader
                title={`The p-value distribution across ${integer(params.replications)} repeats of this experiment`}
                subtitle="A single p-value is one draw from this. Running the whole experiment many times shows you the distribution it came from."
              />
              <CardBody>
                <HistogramChart
                  bins={histogram(replication.pValues, 40)}
                  title="Distribution of p-values"
                  description={
                    isNullTrue
                      ? "A flat, uniform histogram of p-values across the full range from 0 to 1 — the signature of a true null hypothesis."
                      : "A histogram of p-values heavily concentrated near zero, the signature of a real effect."
                  }
                  xLabel="p-value"
                  formatX={(v) => v.toFixed(2)}
                  markers={[{ value: params.alpha, label: `α = ${params.alpha.toFixed(3)}`, color: "var(--negative)" }]}
                  height={280}
                  footnote={
                    isNullTrue
                      ? "Under a TRUE null the p-value is uniformly distributed on [0,1]. That is exactly why α is the false-positive rate: the fraction of a uniform distribution below α is α. A p-value of 0.04 is no more surprising than one of 0.64."
                      : "Under a real effect the distribution piles up near zero. The fraction below α is the power — and notice how much of the distribution still sits above α when power is low."
                  }
                />
              </CardBody>
            </Card>
          </div>
        </div>
      </ExperimentSection>

      <ExperimentSection kind="model">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="The t-test" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="Test statistic"
                equation={"t = \\frac{\\bar{x} - \\mu_0}{s/\\sqrt{n}}"}
                description="How many standard errors the sample mean sits from the hypothesised value."
                where={[
                  { symbol: "\\bar{x}", meaning: "the sample mean" },
                  { symbol: "\\mu_0", meaning: "the value under the null hypothesis, here zero" },
                  { symbol: "s/\\sqrt{n}", meaning: "the standard error of the MEAN — not the standard deviation of the data" },
                ]}
              />
              <Callout tone="caution" title="The most common error in applied statistics">
                <p>
                  The denominator is <InlineMath>{"s/\\sqrt{n}"}</InlineMath>, not{" "}
                  <InlineMath>{"s"}</InlineMath>. The standard deviation describes how spread out the{" "}
                  <em>data</em> is; the standard error describes how much the <em>sample mean</em> would move
                  if you repeated the experiment.
                </p>
                <p>
                  Confusing them inflates or deflates every p-value by a factor of{" "}
                  <InlineMath>{"\\sqrt{n}"}</InlineMath>. At n = {params.sampleSize} that factor is{" "}
                  {ratio(Math.sqrt(params.sampleSize), 2)}.
                </p>
              </Callout>
              <EquationBlock
                label="Why Student-t rather than normal"
                equation={"t \\sim t_{n-1} \\quad\\text{when } \\sigma \\text{ is estimated from the same sample}"}
                description="The heavier tails are the price of not knowing the true standard deviation. At n − 1 = 5 the 95% critical value is 2.571 rather than 1.960 — a 31% wider interval."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="The two kinds of error" />
            <CardBody className="space-y-3">
              <DataTable
                columns={["", "Null is TRUE", "Null is FALSE"]}
                align={["left", "left", "left"]}
                rows={[
                  [
                    <strong key="r" className="text-ink">Reject</strong>,
                    <span key="a" className="text-negative">Type I error — probability α = {params.alpha.toFixed(3)}</span>,
                    <span key="b" className="text-positive">Correct — probability = power = {percent(theoreticalPower, 1)}</span>,
                  ],
                  [
                    <strong key="t" className="text-ink">Retain</strong>,
                    <span key="c" className="text-positive">Correct — probability 1 − α</span>,
                    <span key="d" className="text-negative">Type II error — probability 1 − power = {percent(1 - theoreticalPower, 1)}</span>,
                  ],
                ]}
                caption="You choose α directly. Power follows from α, the sample size, and the size of the real effect — which is why it is so often left uncomputed."
              />
              <EquationBlock
                label="Power"
                equation={"1 - \\beta = \\Phi\\!\\left(\\frac{\\delta}{\\sigma/\\sqrt{n}} - z_{1-\\alpha/2}\\right) + \\Phi\\!\\left(\\frac{-\\delta}{\\sigma/\\sqrt{n}} - z_{1-\\alpha/2}\\right)"}
                description="The probability of correctly rejecting a false null."
              />
              <p className="text-xs leading-relaxed text-ink-muted">
                Lowering α reduces Type I errors and <em>increases</em> Type II errors. There is no choice that
                improves both; the only way to reduce both at once is a larger sample.
              </p>
            </CardBody>
          </Card>
        </div>

        <Card className="mt-4">
          <CardHeader title="Power against sample size" subtitle="At the current effect size and α." />
          <CardBody>
            <MultiLineChart
              series={[
                { key: "power", label: "Power", values: powerCurve.powers, color: "var(--series-1)", width: 2.2 },
                { key: "target", label: "80% convention", values: powerCurve.powers.map(() => 0.8), color: "var(--ink-faint)", dashed: true },
                { key: "alpha", label: `α = ${params.alpha.toFixed(3)}`, values: powerCurve.powers.map(() => params.alpha), color: "var(--negative)", dashed: true },
              ]}
              title="Power curve"
              description="Power rising with sample size toward 1, crossing the conventional 80% threshold at a specific n, and flattening out at an effect-dependent rate."
              xLabel="Sample size n"
              yLabel="Power"
              formatX={(i) => integer(powerCurve.sizes[Math.round(i)] ?? 0)}
              formatY={(v) => percent(v, 0)}
              height={280}
              footnote={
                isNullTrue
                  ? "With a true effect of exactly zero, 'power' collapses to α — you reject at the rate you chose, no matter how much data you collect. More data cannot help you detect something that is not there."
                  : `At the current effect of ${ratio(params.trueEffect, 2)}, reaching 80% power needs n ≈ ${integer(requiredSampleSize(Math.abs(params.trueEffect), params.populationSd, 0.8, params.alpha))}.`
              }
            />
          </CardBody>
        </Card>
      </ExperimentSection>

      <ExperimentSection kind="results" title="Testing many things at once">
        <Card>
          <CardHeader
            title={`${integer(params.numberOfTests)} simultaneous tests — every one of a TRUE null`}
            subtitle="There is no effect anywhere. Every rejection below is a false positive, and you can count them because you built the data."
          />
          <CardBody className="space-y-4">
            <MetricGrid className="sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Uncorrected rejections"
                value={integer(multipleTesting.falsePositivesUncorrected)}
                tone={multipleTesting.falsePositivesUncorrected > 0 ? "negative" : "positive"}
                footnote="All false by construction"
              />
              <MetricCard
                label="After Bonferroni"
                value={integer(multipleTesting.falsePositivesBonferroni)}
                tone={multipleTesting.falsePositivesBonferroni === 0 ? "positive" : "caution"}
              />
              <MetricCard
                label="After Benjamini-Hochberg"
                value={integer(multipleTesting.falsePositivesBH)}
                tone={multipleTesting.falsePositivesBH === 0 ? "positive" : "caution"}
              />
              <MetricCard
                label="P(at least one false positive)"
                value={percent(multipleTesting.expectedFWER, 1)}
                tone={multipleTesting.expectedFWER > 0.5 ? "negative" : "caution"}
                hint="1 − (1 − α)^m. This is the family-wise error rate, and it is why testing many hypotheses at α = 0.05 each is not the same as being 95% confident overall."
              />
            </MetricGrid>

            <SimpleBarChart
              data={[5, 10, 20, 50, 100, 200].map((m) => ({
                tests: String(m),
                fwer: familyWiseErrorRate(m, params.alpha),
              }))}
              xKey="tests"
              bars={[{ key: "fwer", label: "P(at least one false positive)", color: "var(--negative)" }]}
              title="Family-wise error rate against the number of tests"
              description="The probability of at least one false positive climbing steeply toward 1 as the number of simultaneous tests grows."
              formatY={(v) => percent(v, 0)}
              height={240}
              footnote={`At α = ${params.alpha.toFixed(3)}, testing 20 hypotheses gives a ${percent(familyWiseErrorRate(20, params.alpha), 0)} chance of at least one false positive. This single arithmetic fact explains a large share of irreproducible research.`}
            />

            <FindingBlock
              observation={
                <>
                  Across {integer(params.numberOfTests)} tests where the null is true everywhere,{" "}
                  <strong className="text-ink">{integer(multipleTesting.falsePositivesUncorrected)}</strong>{" "}
                  came out significant at α = {params.alpha.toFixed(3)}. Bonferroni admitted{" "}
                  {integer(multipleTesting.falsePositivesBonferroni)} and Benjamini-Hochberg{" "}
                  {integer(multipleTesting.falsePositivesBH)}. Separately, across{" "}
                  {integer(params.replications)} repeats of the single experiment, the rejection rate was{" "}
                  {percent(replication.rejectionRate, 2)}
                  {isNullTrue ? ` against a nominal α of ${params.alpha.toFixed(3)}` : ` against a theoretical power of ${percent(theoreticalPower, 1)}`}.
                </>
              }
              interpretation={
                <>
                  <p>
                    Under a true null the p-value is <em>uniformly distributed</em>. That is the whole
                    mechanism: α is the false-positive rate precisely because the fraction of a uniform
                    distribution below α is α. So each test has a {percent(params.alpha, 1)} chance of a false
                    positive, and across {integer(params.numberOfTests)} of them the chance of at least one is{" "}
                    {percent(multipleTesting.expectedFWER, 1)}.
                  </p>
                  <p className="mt-2">
                    Bonferroni controls the probability of <em>any</em> false positive by testing each at
                    α/m. Benjamini-Hochberg controls the expected <em>proportion</em> of rejections that are
                    false, which is far less severe and usually the better trade when screening candidates.
                    Neither is more correct; they answer different questions.
                  </p>
                </>
              }
              conclusion={
                <>
                  A p-value below 0.05 means &ldquo;this would happen 1 time in 20 if nothing were going
                  on&rdquo;. If you ran 20 tests, you should expect exactly that. Significance is a statement
                  about one test in isolation, and it stops meaning what it says the moment you run several.
                </>
              }
              limitation={
                <>
                  This is the same mechanism as the Overfitting Lab, in different clothing. There, searching
                  240 strategy parameters on signal-free data produced an impressive in-sample Sharpe; here,
                  running {integer(params.numberOfTests)} tests on effect-free data produces significant
                  p-values. Both are the expected maximum of many noisy draws. The practical difficulty is
                  that nobody reports how many tests they ran — and in a backtest, every parameter you
                  adjusted after seeing a result was a test.
                </>
              }
            />

            <ResearchOnly>
              <DataTable
                columns={["Test", "p-value", "Uncorrected", "Bonferroni", "Benjamini-Hochberg"]}
                align={["right", "right", "left", "left", "left"]}
                caption={`All ${integer(params.numberOfTests)} nulls are true. Bonferroni threshold: ${fmtNumber(params.alpha / params.numberOfTests, 6)}.`}
                rows={multipleTesting.pValues.slice(0, 30).map((p, i) => [
                  integer(i + 1),
                  fmtNumber(p, 5),
                  <span key="u" className={multipleTesting.uncorrected[i] ? "text-negative" : "text-ink-faint"}>
                    {multipleTesting.uncorrected[i] ? "REJECT (false)" : "retain"}
                  </span>,
                  <span key="b" className={multipleTesting.bonferroni[i] ? "text-negative" : "text-ink-faint"}>
                    {multipleTesting.bonferroni[i] ? "REJECT (false)" : "retain"}
                  </span>,
                  <span key="h" className={multipleTesting.benjaminiHochberg[i] ? "text-negative" : "text-ink-faint"}>
                    {multipleTesting.benjaminiHochberg[i] ? "REJECT (false)" : "retain"}
                  </span>,
                ])}
              />
            </ResearchOnly>
          </CardBody>
        </Card>

        {!isNullTrue ? (
          <Card className="mt-4">
            <CardHeader
              title="The winner's curse"
              subtitle="Among the experiments that reached significance, how large did the effect appear?"
            />
            <CardBody>
              <MetricGrid className="sm:grid-cols-3 lg:grid-cols-3">
                <MetricCard label="True effect" value={ratio(Math.abs(params.trueEffect), 4)} />
                <MetricCard
                  label="Average estimate, all runs"
                  value={ratio(replication.meanEstimateOverall, 4)}
                />
                <MetricCard
                  label="Average estimate, significant runs only"
                  value={ratio(replication.meanEstimateWhenSignificant, 4)}
                  tone={replication.meanEstimateWhenSignificant > Math.abs(params.trueEffect) * 1.1 ? "negative" : "neutral"}
                  footnote={`${ratio(replication.meanEstimateWhenSignificant / Math.max(1e-9, Math.abs(params.trueEffect)), 2)}× the truth`}
                />
              </MetricGrid>
              <p className="mt-3 max-w-prose text-xs leading-relaxed text-ink-muted">
                Significance requires a large enough estimate, so conditioning on significance selects the runs
                where noise happened to help. Published effects are therefore systematically exaggerated, and
                the exaggeration is worst exactly where power is lowest. Drag the sample size down and watch
                the inflation grow — this is why underpowered studies do not merely fail to detect effects,
                they actively mislead about their size.
              </p>
            </CardBody>
          </Card>
        ) : null}
      </ExperimentSection>

      <ExperimentSection kind="interpretation">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="What a p-value is not" />
            <CardBody>
              <dl className="space-y-2.5 text-xs leading-relaxed">
                {[
                  ["Not the probability the null is true.", "It is P(data this extreme | null true), not P(null true | data). Reversing a conditional probability is the base-rate error from the Probability Playground."],
                  ["Not the probability your result will replicate.", "A study with p = 0.04 has a replication probability closer to 50% than to 96%."],
                  ["Not a measure of effect size.", "With enough data, a trivially small effect becomes highly significant. Significance and importance are unrelated."],
                  ["Not evidence FOR the null when large.", "Failing to reject means the data was consistent with the null — which an underpowered study guarantees regardless of the truth."],
                  ["Not valid after peeking.", "Checking results and collecting more data until p < 0.05 inflates the false-positive rate far above α. This is optional stopping."],
                ].map(([title, body]) => (
                  <div key={title}>
                    <dt className="font-semibold text-ink">{title}</dt>
                    <dd className="mt-0.5 text-ink-muted">{body}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Why this matters more in finance than almost anywhere" />
            <CardBody className="space-y-2.5 text-xs leading-relaxed text-ink-muted">
              <p>
                <strong className="text-ink">Effects are tiny and noise is enormous.</strong> A strategy with a
                true Sharpe of 0.5 needs about 18 years of data before its edge is statistically
                distinguishable from zero. Its standard error after one year is{" "}
                {ratio(sharpeStandardError(0.5, 1), 3)} — larger than the effect itself.
              </p>
              <p>
                <strong className="text-ink">The number of tests is unbounded and unreported.</strong> Every
                parameter you adjusted, every variant you tried, every dataset you discarded is a test. The
                effective m is enormous and nobody knows it, which makes any correction a guess.
              </p>
              <p>
                <strong className="text-ink">The data cannot be extended.</strong> You cannot collect another
                century of market history. Power is bounded by what exists, which means some questions are
                permanently unanswerable at conventional thresholds.
              </p>
              <p>
                <strong className="text-ink">The system adapts.</strong> Even a real effect can disappear once
                enough people trade it, so a correctly-rejected null today may be a true null tomorrow.
              </p>
            </CardBody>
          </Card>
        </div>
      </ExperimentSection>

      <ExperimentSection kind="limitations">
        <Callout tone="caution" title="Everything here assumes the model is right">
          <p>
            The t-test assumes independent observations drawn from a normal distribution. Financial returns
            violate both: they are fat-tailed and they exhibit volatility clustering. Dependence is the more
            damaging violation — it inflates the effective false-positive rate well above α, because the
            effective sample size is smaller than the nominal one.
          </p>
          <p>
            More fundamentally, this entire apparatus answers one narrow question: how surprising is this data
            if nothing is going on? It says nothing about whether your hypothesis is plausible, whether the
            effect is large enough to matter, whether the data was collected honestly, or whether the model is
            appropriate. Those judgements sit outside the mathematics, and no p-value will make them for you.
          </p>
        </Callout>
      </ExperimentSection>

      <ReproducibilityPanel
        title="Statistical Inference Lab"
        prefix="INF"
        config={config}
        labels={INFERENCE_LABELS}
        basePath="/labs/inference"
        exports={[
          {
            label: "Export p-values (CSV)",
            filename: `quantlab-inference-${params.seed}.csv`,
            mime: "text/csv",
            build: () =>
              toCSV(
                replication.pValues.map((p, i) => ({
                  replication: i,
                  p_value: p.toFixed(8),
                  estimate: replication.estimates[i].toFixed(8),
                  rejected: p < params.alpha ? 1 : 0,
                })),
              ),
          },
          {
            label: "Export analysis (JSON)",
            filename: `quantlab-inference-${params.seed}.json`,
            mime: "application/json",
            build: () =>
              JSON.stringify(
                {
                  experiment: "Statistical Inference Lab",
                  parameters: config,
                  null_is_true: isNullTrue,
                  single_test: singleSample.test,
                  theoretical_power: theoreticalPower,
                  observed_rejection_rate: replication.rejectionRate,
                  multiple_testing: {
                    tests: params.numberOfTests,
                    expected_fwer: multipleTesting.expectedFWER,
                    uncorrected_rejections: multipleTesting.falsePositivesUncorrected,
                    bonferroni_rejections: multipleTesting.falsePositivesBonferroni,
                    benjamini_hochberg_rejections: multipleTesting.falsePositivesBH,
                  },
                  note: "Synthetic data with a known true effect, which is what makes the error counts measurable.",
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
