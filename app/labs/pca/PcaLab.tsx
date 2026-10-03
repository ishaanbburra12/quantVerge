"use client";

import { useMemo, useState } from "react";
import {
  Button, Callout, Card, CardBody, CardHeader, MetricCard, MetricGrid,
  SliderControl, NumberField, SelectField, Toggle, DataTable,
} from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";
import { ExperimentSection, FindingBlock, ResearchOnly } from "@/components/labs/ExperimentSection";
import { LabShell, ReproducibilityPanel } from "@/components/labs/LabShell";
import { MultiLineChart, SimpleBarChart } from "@/components/charts";
import { CorrelationHeatmap } from "@/components/charts/Heatmap";
import { useDebounced } from "@/lib/hooks/useBatchedSimulation";
import { pcaFromData, principalComponentScores, reconstructFromComponents } from "@/lib/finance/pca";
import { generateAssetReturns, generateCurveChanges } from "@/lib/simulation/pcaData";
import { correlationFromCovariance } from "@/lib/math/linearAlgebra";
import { covariance, standardDeviation, correlation } from "@/lib/statistics/descriptive";
import { toCSV } from "@/lib/experiment/config";
import { percent, ratio, integer } from "@/lib/format";
import type { LabMeta } from "@/content/labs";
import {
  PCA_DEFAULTS, PCA_LABELS, ASSET_NAMES, ASSET_BETAS, CURVE_TENORS, type PcaParams,
} from "@/lib/labs/pca";

const COMPONENT_COLORS = [
  "var(--series-1)", "var(--series-2)", "var(--series-3)",
  "var(--series-4)", "var(--series-5)", "var(--series-6)",
];

export function PcaLab({ lab, initialParams }: { lab: LabMeta; initialParams: PcaParams }) {
  const [liveParams, setParams] = useState<PcaParams>(initialParams);
  const params = useDebounced(liveParams, 180);

  const update = <K extends keyof PcaParams>(key: K, value: PcaParams[K]) =>
    setParams((previous) => ({ ...previous, [key]: value }));

  const isCurve = params.dataset === "yieldCurve";
  const labels = isCurve ? CURVE_TENORS.map((t) => `${t}y`) : ASSET_NAMES;

  const data = useMemo(
    () =>
      isCurve
        ? generateCurveChanges(params.observations, params.seed, params.noise)
        : generateAssetReturns(params.observations, params.seed, params.marketStrength, params.noise),
    [isCurve, params.observations, params.seed, params.noise, params.marketStrength],
  );

  const pca = useMemo(
    () => pcaFromData(data, params.useCorrelation === 1),
    [data, params.useCorrelation],
  );

  const correlationMatrix = useMemo(() => {
    const n = data[0].length;
    const columns = Array.from({ length: n }, (_, i) => data.map((row) => row[i]));
    const cov = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => covariance(columns[i], columns[j], 1)),
    );
    return correlationFromCovariance(cov);
  }, [data]);

  const scores = useMemo(() => principalComponentScores(data, pca, 3), [data, pca]);

  /** Reconstruction error as a function of how many components are kept. */
  const reconstructionError = useMemo(() => {
    const n = data[0].length;
    return Array.from({ length: Math.min(n, 8) }, (_, idx) => {
      const k = idx + 1;
      const rebuilt = reconstructFromComponents(data, pca, k);
      let sum = 0;
      for (let t = 0; t < data.length; t++) {
        for (let i = 0; i < n; i++) sum += (rebuilt[t][i] - data[t][i]) ** 2;
      }
      return { k: String(k), rmse: Math.sqrt(sum / (data.length * n)) };
    });
  }, [data, pca]);

  /**
   * For the asset dataset, how closely do PC1's loadings track the betas we
   * actually used to generate the data? This is the test of whether PCA
   * recovered the structure.
   */
  const betaRecovery = useMemo(() => {
    if (isCurve) return null;
    const loadings = pca.components[0].loadings;
    return {
      correlation: correlation(loadings, ASSET_BETAS),
      pairs: ASSET_NAMES.map((name, i) => ({ name, beta: ASSET_BETAS[i], loading: loadings[i] })),
    };
  }, [isCurve, pca]);

  const config: Record<string, number | string> = { ...params };

  return (
    <LabShell
      lab={lab}
      question="Given a set of correlated series and no information about what drives them, can a purely mechanical procedure recover the underlying factors — and do those factors turn out to mean anything?"
    >
      <ExperimentSection kind="inputs">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Dataset" subtitle="Both are generated from a known factor structure, so you can check whether PCA finds it." />
            <CardBody className="space-y-4">
              <SelectField
                label="Data"
                value={liveParams.dataset}
                options={[
                  { value: "yieldCurve", label: "Yield curve changes (10 tenors)" },
                  { value: "assets", label: "Asset returns (6 sectors)" },
                ]}
                onChange={(v) => update("dataset", v)}
              />
              <p className="rounded-card border border-line bg-surface-sunken px-3 py-2 text-2xs leading-relaxed text-ink-muted">
                {isCurve
                  ? "Daily changes in a yield curve, generated by shocking three Nelson-Siegel parameters independently. There are exactly three drivers by construction — PCA is not told this."
                  : "Six sector returns driven by one common factor with different exposures, plus idiosyncratic noise. This is the single-factor model underneath CAPM."}
              </p>

              {!isCurve ? (
                <SliderControl
                  label="Common factor strength"
                  value={liveParams.marketStrength}
                  min={0} max={1.6} step={0.05}
                  onChange={(v) => update("marketStrength", v)}
                  format={(v) => v.toFixed(2)}
                  hint="How much the shared factor drives returns. Set it to 0 and the assets become independent — PC1 should then explain no more than any other component."
                />
              ) : null}

              <SliderControl
                label="Idiosyncratic noise"
                value={liveParams.noise}
                min={0.05} max={1.5} step={0.05}
                onChange={(v) => update("noise", v)}
                format={(v) => v.toFixed(2)}
                hint="Variation specific to each series. More noise buries the shared structure and spreads variance across more components."
              />
              <SliderControl
                label="Observations"
                value={liveParams.observations}
                min={100} max={5000} step={100}
                onChange={(v) => update("observations", v)}
                format={(v) => integer(v)}
              />
              <SliderControl
                label="Components used to reconstruct"
                value={liveParams.reconstructWith}
                min={1} max={Math.min(8, labels.length)} step={1}
                onChange={(v) => update("reconstructWith", v)}
                format={(v) => String(v)}
              />
              <Toggle
                label="Use correlation matrix"
                checked={liveParams.useCorrelation === 1}
                onChange={(v) => update("useCorrelation", v ? 1 : 0)}
                hint="Standardises every series before decomposing, so each contributes equally. Without it, a high-variance series can dominate PC1 purely by being large."
              />
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
                <Button size="sm" variant="ghost" onClick={() => setParams(PCA_DEFAULTS)}>
                  Reset
                </Button>
              </div>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <MetricGrid>
              <MetricCard
                label="PC1 variance explained"
                value={percent(pca.components[0].varianceExplained, 1)}
                tone={pca.components[0].varianceExplained > 0.5 ? "positive" : "neutral"}
                hint="How much of all the variation is captured by a single direction. Above 50% means one dominant driver."
              />
              <MetricCard
                label="First three components"
                value={percent(pca.components[Math.min(2, pca.components.length - 1)].cumulativeVarianceExplained, 1)}
                tone="positive"
              />
              <MetricCard
                label="Components for 90%"
                value={integer(pca.componentsFor90Percent)}
                footnote={`out of ${labels.length}`}
                hint="How many directions you need to keep before you have 90% of the variation. The lower this is, the more redundant the original variables were."
              />
              <MetricCard
                label="Effective dimensions"
                value={ratio(
                  pca.eigenvalues.reduce((a, b) => a + b, 0) ** 2 /
                    pca.eigenvalues.reduce((a, b) => a + b * b, 0),
                  2,
                )}
                hint="The participation ratio: a continuous measure of how many directions genuinely matter. Equals the variable count when everything is independent, and 1 when a single factor dominates."
              />
            </MetricGrid>

            <Card>
              <CardHeader
                title="Scree plot"
                subtitle="Variance explained by each component, in descending order. The 'elbow' is where additional components stop earning their keep."
              />
              <CardBody>
                <SimpleBarChart
                  data={pca.components.map((c, i) => ({
                    component: `PC${i + 1}`,
                    explained: c.varianceExplained,
                    cumulative: c.cumulativeVarianceExplained,
                  }))}
                  xKey="component"
                  bars={[
                    { key: "explained", label: "Variance explained", color: "var(--series-1)" },
                    { key: "cumulative", label: "Cumulative", color: "var(--series-3)" },
                  ]}
                  title="Variance explained by component"
                  description="Bars falling steeply from the first component, with a cumulative line rising toward 100%. A sharp drop after the first few components means the data has low effective dimensionality."
                  formatY={(v) => percent(v, 0)}
                  height={270}
                  footnote={`${labels.length} variables reduce to ${pca.componentsFor90Percent} component${pca.componentsFor90Percent === 1 ? "" : "s"} at the 90% threshold.`}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Component shapes"
                subtitle={
                  isCurve
                    ? "What each component does to the curve. Look at the shapes before reading the labels."
                    : "How much each sector loads on each component."
                }
              />
              <CardBody>
                {isCurve ? (
                  <MultiLineChart
                    series={pca.components.slice(0, 3).map((c, i) => ({
                      key: `pc${i}`,
                      label: `PC${i + 1} (${percent(c.varianceExplained, 1)})`,
                      values: c.loadings,
                      color: COMPONENT_COLORS[i],
                      width: 2.2 - i * 0.3,
                    }))}
                    title="Principal component loadings across the curve"
                    description="Three curves showing how each principal component moves rates at each maturity. The first is roughly flat and all one sign, the second slopes from negative to positive, and the third bulges in the middle."
                    xLabel="Maturity"
                    yLabel="Loading"
                    formatX={(i) => `${CURVE_TENORS[Math.round(i)] ?? ""}y`}
                    formatY={(v) => v.toFixed(2)}
                    referenceY={0}
                    height={300}
                    footnote="PC1 moves every maturity the same way — a parallel shift. PC2 moves short and long rates in opposite directions — a tilt. PC3 moves the middle against both ends — a bulge. Nobody told the algorithm to find these."
                  />
                ) : (
                  <SimpleBarChart
                    data={ASSET_NAMES.map((name, i) => ({
                      asset: name.split(" ")[0],
                      pc1: pca.components[0].loadings[i],
                      pc2: pca.components[1]?.loadings[i] ?? 0,
                      pc3: pca.components[2]?.loadings[i] ?? 0,
                    }))}
                    xKey="asset"
                    bars={[
                      { key: "pc1", label: `PC1 (${percent(pca.components[0].varianceExplained, 1)})`, color: COMPONENT_COLORS[0] },
                      { key: "pc2", label: `PC2 (${percent(pca.components[1]?.varianceExplained ?? 0, 1)})`, color: COMPONENT_COLORS[1] },
                      { key: "pc3", label: `PC3 (${percent(pca.components[2]?.varianceExplained ?? 0, 1)})`, color: COMPONENT_COLORS[2] },
                    ]}
                    title="Loadings by sector"
                    description="Grouped bars showing each sector's weight in the first three components. The first component has all weights the same sign; later components mix signs."
                    formatY={(v) => v.toFixed(2)}
                    height={290}
                    footnote="PC1 having every loading the same sign is the market factor: everything rising and falling together. Later components are the ways sectors diverge from it."
                  />
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      </ExperimentSection>

      <ExperimentSection kind="model">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="PCA is an eigendecomposition" />
            <CardBody className="space-y-3">
              <EquationBlock
                label="The defining relation"
                equation={"\\boldsymbol{\\Sigma}\\,\\mathbf{v}_i = \\lambda_i\\,\\mathbf{v}_i"}
                description="An eigenvector is a direction the matrix does not rotate — it only stretches it, by the factor λ."
                where={[
                  { symbol: "\\boldsymbol{\\Sigma}", meaning: "the covariance matrix of the variables" },
                  { symbol: "\\mathbf{v}_i", meaning: "the i-th principal direction, of unit length" },
                  { symbol: "\\lambda_i", meaning: "the variance of the data along that direction" },
                ]}
              />
              <EquationBlock
                label="Variance explained"
                equation={"\\text{share}_i = \\frac{\\lambda_i}{\\sum_j \\lambda_j}"}
                description="The eigenvalues sum to the total variance, so each one's share is immediately interpretable."
              />
              <p className="text-xs leading-relaxed text-ink-muted">
                Because a covariance matrix is symmetric, the eigenvalues are guaranteed real and the
                eigenvectors guaranteed orthogonal. That orthogonality is why the components are uncorrelated:
                PCA is literally a rotation of the coordinate axes onto the directions of greatest spread.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Why the first component is usually 'everything together'" />
            <CardBody className="space-y-3">
              <p className="text-xs leading-relaxed text-ink-muted">
                If every pair of variables is positively correlated, the covariance matrix has all-positive
                entries. The direction of greatest variance is then the one where all variables move the same
                way at once — so PC1 comes out with every loading the same sign.
              </p>
              <p className="text-xs leading-relaxed text-ink-muted">
                In equities that is &ldquo;the market&rdquo;. In rates it is a parallel shift of the whole
                curve. Nothing in the algorithm knows about markets or curves; the interpretation is something
                you supply afterwards, by looking at the shape.
              </p>
              <Callout tone="caution" title="Components are directions, not causes">
                <p>
                  PCA finds directions of variance. It does not find causes, and it does not know what the
                  variables mean. The names &ldquo;level&rdquo;, &ldquo;slope&rdquo; and &ldquo;curvature&rdquo;
                  are human labels attached to shapes the algorithm produced without intent.
                </p>
                <p>
                  A component is also only defined up to sign — flipping one gives an equally valid answer —
                  and components beyond the first few are often unstable, changing substantially with the
                  sample. Treating PC4 as a real economic factor is usually over-reading the output.
                </p>
              </Callout>
            </CardBody>
          </Card>
        </div>

        <ResearchOnly>
          <Card className="mt-4">
            <CardHeader title="Correlation matrix of the inputs" subtitle="PCA is a function of this matrix and nothing else." />
            <CardBody>
              <CorrelationHeatmap
                matrix={correlationMatrix}
                labels={labels}
                caption="The structure PCA is decomposing. Strong positive correlation throughout is what produces a dominant first component."
              />
            </CardBody>
          </Card>
        </ResearchOnly>
      </ExperimentSection>

      <ExperimentSection kind="results">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Full decomposition" />
            <CardBody>
              <DataTable
                columns={["Component", "Eigenvalue", "Variance explained", "Cumulative", ...labels.map((l) => l.split(" ")[0])]}
                align={["left", "right", "right", "right", ...labels.map(() => "right" as const)]}
                caption="Loadings are the weights defining each direction. Each column of loadings has unit length, and any two columns are orthogonal."
                rows={pca.components.map((c, i) => [
                  <span key={i} style={{ color: COMPONENT_COLORS[i % COMPONENT_COLORS.length] }}>PC{i + 1}</span>,
                  c.eigenvalue.toExponential(3),
                  percent(c.varianceExplained, 2),
                  percent(c.cumulativeVarianceExplained, 2),
                  ...c.loadings.map((l, j) => <span key={j}>{ratio(l, 3)}</span>),
                ])}
              />
            </CardBody>
          </Card>

          {isCurve ? (
            <FindingBlock
              observation={
                <>
                  PCA on {integer(params.observations)} days of yield-curve changes produced three components
                  explaining <strong className="text-ink">{percent(pca.components[0].varianceExplained, 1)}</strong>,{" "}
                  <strong className="text-ink">{percent(pca.components[1].varianceExplained, 1)}</strong> and{" "}
                  <strong className="text-ink">{percent(pca.components[2].varianceExplained, 1)}</strong> of the
                  variation — <strong className="text-ink">{percent(pca.components[2].cumulativeVarianceExplained, 1)}</strong>{" "}
                  between them. PC1&rsquo;s loadings are all the same sign and roughly equal. PC2&rsquo;s change
                  sign between the short and long end. PC3&rsquo;s differ in the middle from both ends.
                </>
              }
              interpretation={
                <>
                  <p>
                    Those three shapes are <strong className="text-ink">level, slope and curvature</strong>.
                    PC1 shifts the whole curve in parallel; PC2 tilts it; PC3 bulges the middle. The algorithm
                    was given a matrix of numbers and no information about what a yield curve is.
                  </p>
                  <p className="mt-2">
                    Here it recovered the structure because I built the data from exactly three Nelson-Siegel
                    parameters — so finding three factors is confirmation that the method works, not a
                    discovery. The genuinely remarkable fact is that{" "}
                    <strong className="text-ink">the same three shapes appear in real yield-curve data</strong>,
                    where nobody imposed any such structure, typically explaining 95–99% of the variation.
                  </p>
                </>
              }
              conclusion={
                <>
                  A ten-dimensional object is, to a very good approximation, a three-dimensional one. That is
                  why rates desks hedge in level, slope and curvature rather than managing ten separate
                  exposures — the other seven dimensions barely move.
                </>
              }
              limitation={
                <>
                  PCA is a linear method applied to a covariance matrix, so it sees linear co-movement and
                  nothing else. It also assumes the structure is stable: the components here are estimated
                  from the whole sample at once, and in reality factor loadings shift over time, usually most
                  violently during the crises you would most want them to hold. Components beyond the third
                  are also poorly determined — change the seed and watch PC4 and PC5 reorder themselves.
                </>
              }
            />
          ) : betaRecovery ? (
            <>
              <Card>
                <CardHeader
                  title="Did PCA recover the factor exposures?"
                  subtitle="Comparing PC1's loadings against the betas actually used to generate the data."
                />
                <CardBody>
                  <DataTable
                    columns={["Sector", "True beta", "PC1 loading", "Loading ÷ beta"]}
                    align={["left", "right", "right", "right"]}
                    caption="If PCA recovered the structure, the ratios in the final column should be roughly constant — the loadings are the betas up to an overall scale."
                    rows={betaRecovery.pairs.map((p) => [
                      p.name,
                      ratio(p.beta, 2),
                      ratio(p.loading, 4),
                      ratio(p.loading / p.beta, 4),
                    ])}
                  />
                </CardBody>
              </Card>

              <FindingBlock
                observation={
                  <>
                    PC1 explains <strong className="text-ink">{percent(pca.components[0].varianceExplained, 1)}</strong>{" "}
                    of the variance, with every loading the same sign. The correlation between PC1&rsquo;s
                    loadings and the true factor exposures used to build the data is{" "}
                    <strong className="text-ink">{ratio(betaRecovery.correlation, 4)}</strong>.
                  </>
                }
                interpretation={
                  <>
                    PCA recovered the factor structure without being told it existed. It was handed six
                    correlated return series and found the single direction that drives them, with weights
                    proportional to each sector&rsquo;s true exposure. Note that it recovers the betas only up
                    to an overall scale — eigenvectors are normalised to unit length, so the ratios are
                    constant rather than equal to 1.
                  </>
                }
                conclusion={
                  <>
                    This is the empirical foundation under CAPM and every factor model: the dominant source of
                    individual stock variation is a common factor, and it can be extracted from returns alone
                    without any theory about what it is.
                  </>
                }
                limitation={
                  <>
                    I generated the data with exactly one factor, so finding one is a test of the method rather
                    than a finding about markets. Set the common factor strength to zero and PC1 should drop to
                    roughly {percent(1 / ASSET_NAMES.length, 0)} — the share you would get from pure noise —
                    which is the control condition worth running before trusting any PCA result.
                  </>
                }
              />
            </>
          ) : null}

          <Card>
            <CardHeader
              title="What you lose by keeping fewer components"
              subtitle="Reconstruction error against the number of components retained."
            />
            <CardBody>
              <SimpleBarChart
                data={reconstructionError}
                xKey="k"
                bars={[{ key: "rmse", label: "Reconstruction RMSE", color: "var(--series-5)" }]}
                title="Reconstruction error"
                description="Error falling steeply as the first few components are added, then flattening — the later components carry very little information."
                formatY={(v) => v.toExponential(1)}
                height={240}
                footnote={`Keeping ${params.reconstructWith} component${params.reconstructWith === 1 ? "" : "s"} out of ${labels.length} reproduces the data to an RMSE of ${reconstructionError[params.reconstructWith - 1]?.rmse.toExponential(2) ?? "—"}. The flattening is the point: beyond the elbow you are storing noise.`}
              />
            </CardBody>
          </Card>

          <ResearchOnly>
            <Card>
              <CardHeader title="Component scores" subtitle="The data re-expressed in the rotated coordinates. These series are uncorrelated by construction." />
              <CardBody>
                <MultiLineChart
                  series={[0, 1, 2].map((k) => ({
                    key: `s${k}`,
                    label: `PC${k + 1} score`,
                    values: scores.map((row) => row[k]),
                    color: COMPONENT_COLORS[k],
                    width: 1.2,
                  }))}
                  title="Principal component scores over time"
                  description="Three time series showing how far the data sits along each principal direction on each observation. The first has visibly the largest amplitude."
                  xLabel="Observation"
                  yLabel="Score"
                  formatY={(v) => v.toExponential(1)}
                  referenceY={0}
                  height={260}
                  footnote={`Realised correlation between PC1 and PC2 scores: ${ratio(correlation(scores.map((r) => r[0]), scores.map((r) => r[1])), 6)} — zero to numerical precision, which is the orthogonality guarantee showing up in the data.`}
                />
              </CardBody>
            </Card>
          </ResearchOnly>
        </div>
      </ExperimentSection>

      <ExperimentSection kind="assumptions">
        <Card>
          <CardBody>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[
                { title: "Linearity", body: "PCA finds linear combinations and decomposes a covariance matrix, so it sees only linear co-movement. Non-linear dependence is invisible to it." },
                { title: "Variance means importance", body: "The method ranks directions by variance. A low-variance direction can still be the economically important one — PCA has no way to know." },
                { title: "Stable structure", body: "Components are estimated from the whole sample at once. Real factor loadings shift over time, typically most during crises." },
                { title: "Scale matters", body: "Covariance PCA lets a high-variance series dominate. Correlation PCA standardises first. Neither is universally correct, and the choice changes the answer." },
                { title: "Centred data", body: "PCA describes variation about the mean. Uncentred data mixes the mean level into the first component, which is why this lab decomposes changes rather than levels." },
                { title: "Enough observations", body: "With fewer observations than variables the covariance matrix is singular and the smaller components are pure noise." },
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
        <Callout tone="caution" title="The interpretation is yours, not the algorithm's">
          <p>
            PCA produced some orthogonal directions ranked by variance. Everything beyond that — calling PC1
            &ldquo;the market&rdquo;, or PC2 &ldquo;slope&rdquo; — is a human judgement about what the shapes
            resemble. The method cannot tell you whether a component corresponds to anything real, and it will
            happily produce components from pure noise.
          </p>
          <p>
            That makes the control condition essential: run it with the factor strength at zero, or on
            independent series, and see what &ldquo;no structure&rdquo; looks like. With {labels.length}{" "}
            independent variables each component should explain about{" "}
            {percent(1 / labels.length, 0)}. If your real result does not look clearly different from that,
            you have not found a factor.
          </p>
          <p>
            Finally, note the circularity in this lab: I generated the data from a known factor structure and
            PCA found it. That demonstrates the method works; it establishes nothing about markets. The claim
            that real yield curves are three-dimensional comes from decades of work on actual rate data, not
            from this simulation.
          </p>
        </Callout>
      </ExperimentSection>

      <ReproducibilityPanel
        title="PCA & Factor Lab"
        prefix="PCA"
        config={config}
        labels={PCA_LABELS}
        basePath="/labs/pca"
        exports={[
          {
            label: "Export loadings (CSV)",
            filename: `quantverge-pca-${params.dataset}-${params.seed}.csv`,
            mime: "text/csv",
            build: () =>
              toCSV(
                pca.components.map((c, i) => ({
                  component: `PC${i + 1}`,
                  eigenvalue: c.eigenvalue.toExponential(8),
                  variance_explained: c.varianceExplained.toFixed(8),
                  cumulative: c.cumulativeVarianceExplained.toFixed(8),
                  ...Object.fromEntries(c.loadings.map((l, j) => [`loading_${labels[j]}`, l.toFixed(8)])),
                })),
              ),
          },
          {
            label: "Export analysis (JSON)",
            filename: `quantverge-pca-${params.dataset}-${params.seed}.json`,
            mime: "application/json",
            build: () =>
              JSON.stringify(
                {
                  experiment: "PCA & Factor Lab",
                  dataset: params.dataset,
                  parameters: config,
                  variables: labels,
                  eigenvalues: pca.eigenvalues,
                  components: pca.components.map((c, i) => ({
                    name: `PC${i + 1}`,
                    eigenvalue: c.eigenvalue,
                    variance_explained: c.varianceExplained,
                    loadings: c.loadings,
                  })),
                  components_for_90_percent: pca.componentsFor90Percent,
                  beta_recovery: betaRecovery
                    ? { correlation_with_true_betas: betaRecovery.correlation }
                    : null,
                  note: "Synthetic data generated from a known factor structure. Recovering that structure tests the method; it is not a finding about markets.",
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
