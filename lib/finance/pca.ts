/**
 * Principal Component Analysis.
 *
 * PCA finds the directions along which a set of correlated variables varies
 * most, and reports how much of the total variation each direction accounts
 * for. Mechanically it is the eigendecomposition of the covariance matrix: the
 * eigenvectors are the directions and the eigenvalues are the variances along
 * them.
 *
 * The reason it matters in finance is that return series are heavily correlated,
 * so a small number of components usually explains most of what is going on —
 * and those components frequently turn out to have clean interpretations that
 * nobody put there. That is the interesting part: the structure is discovered,
 * not assumed.
 */

import { eigenSymmetric, type Eigendecomposition } from "@/lib/math/eigen";
import { covariance, mean, standardDeviation } from "@/lib/statistics/descriptive";
import type { Matrix } from "@/lib/math/linearAlgebra";

export interface PrincipalComponent {
  index: number;
  eigenvalue: number;
  /** Fraction of total variance this component explains. */
  varianceExplained: number;
  /** Running total including this component. */
  cumulativeVarianceExplained: number;
  /** The direction itself: one weight per original variable. Unit length. */
  loadings: number[];
  /**
   * Correlation of each original variable with this component, equal to
   * loading * sqrt(eigenvalue) / sd(variable). More interpretable than raw
   * loadings because it is bounded in [-1, 1].
   */
  correlations: number[];
}

export interface PcaResult {
  components: PrincipalComponent[];
  eigenvalues: number[];
  totalVariance: number;
  /** Number of components needed to reach 90% of total variance. */
  componentsFor90Percent: number;
  /** The decomposition, for callers that want the raw objects. */
  decomposition: Eigendecomposition;
  /** Standard deviation of each input variable, used for the correlations. */
  variableSds: number[];
}

/**
 * Run PCA on a covariance matrix.
 *
 * A note on an important modelling choice: PCA on a COVARIANCE matrix weights
 * each variable by its own variance, so a single high-volatility series can
 * dominate the first component purely by being large. PCA on a CORRELATION
 * matrix standardises everything first, so each variable contributes equally.
 *
 * Neither is universally right. For a yield curve, where every rate is measured
 * in the same units and the differences in volatility are themselves meaningful,
 * covariance is the natural choice. For a basket of assets with wildly different
 * volatilities, correlation usually gives the more interpretable answer.
 */
export function pcaFromCovariance(covarianceMatrix: Matrix): PcaResult {
  const decomposition = eigenSymmetric(covarianceMatrix);
  const n = covarianceMatrix.length;

  // Clamp tiny negative eigenvalues to zero. A covariance matrix is positive
  // SEMI-definite in theory, but floating-point error can produce values like
  // -1e-17, which would then poison the variance-explained fractions.
  const eigenvalues = decomposition.values.map((v) => Math.max(0, v));
  const totalVariance = eigenvalues.reduce((a, b) => a + b, 0);
  const variableSds = Array.from({ length: n }, (_, i) =>
    Math.sqrt(Math.max(0, covarianceMatrix[i][i])),
  );

  let cumulative = 0;
  const components: PrincipalComponent[] = eigenvalues.map((eigenvalue, index) => {
    const loadings = decomposition.vectors.map((row) => row[index]);
    const share = totalVariance > 0 ? eigenvalue / totalVariance : 0;
    cumulative += share;
    return {
      index,
      eigenvalue,
      varianceExplained: share,
      cumulativeVarianceExplained: cumulative,
      loadings,
      correlations: loadings.map((loading, i) =>
        variableSds[i] > 0 ? (loading * Math.sqrt(eigenvalue)) / variableSds[i] : 0,
      ),
    };
  });

  const componentsFor90Percent =
    components.findIndex((c) => c.cumulativeVarianceExplained >= 0.9) + 1 || n;

  return {
    components,
    eigenvalues,
    totalVariance,
    componentsFor90Percent,
    decomposition,
    variableSds,
  };
}

/**
 * Run PCA directly on a data matrix, where `data[t][i]` is observation t of
 * variable i. Builds the sample covariance matrix first.
 */
export function pcaFromData(data: number[][], useCorrelation = false): PcaResult {
  if (data.length < 2) throw new Error("pcaFromData: need at least two observations");
  const n = data[0].length;
  const columns = Array.from({ length: n }, (_, i) => data.map((row) => row[i]));

  const matrix: Matrix = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => covariance(columns[i], columns[j], 1)),
  );

  if (!useCorrelation) return pcaFromCovariance(matrix);

  // Standardise to a correlation matrix so each variable contributes equally.
  const sds = Array.from({ length: n }, (_, i) => standardDeviation(columns[i], 1));
  const correlationMatrix: Matrix = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      sds[i] > 0 && sds[j] > 0 ? matrix[i][j] / (sds[i] * sds[j]) : i === j ? 1 : 0,
    ),
  );
  return pcaFromCovariance(correlationMatrix);
}

/**
 * Project observations onto the principal components.
 *
 * The result — the "scores" — is the same data expressed in the rotated
 * coordinate system. Scores on different components are uncorrelated by
 * construction, which is the whole point: PCA turns correlated variables into
 * uncorrelated ones.
 */
export function principalComponentScores(
  data: number[][],
  result: PcaResult,
  componentCount?: number,
): number[][] {
  const k = componentCount ?? result.components.length;
  const n = data[0].length;
  const means = Array.from({ length: n }, (_, i) => mean(data.map((row) => row[i])));

  return data.map((row) =>
    result.components.slice(0, k).map((component) => {
      let score = 0;
      // Centre first — PCA describes variation about the mean, so projecting
      // uncentred data mixes the mean level into the first component.
      for (let i = 0; i < n; i++) score += (row[i] - means[i]) * component.loadings[i];
      return score;
    }),
  );
}

/**
 * Reconstruct the data from the first k components.
 *
 * The gap between the reconstruction and the original is exactly the variation
 * the discarded components carried, which makes this the most direct way to see
 * what "explains 95% of the variance" actually buys you.
 */
export function reconstructFromComponents(
  data: number[][],
  result: PcaResult,
  componentCount: number,
): number[][] {
  const n = data[0].length;
  const means = Array.from({ length: n }, (_, i) => mean(data.map((row) => row[i])));
  const scores = principalComponentScores(data, result, componentCount);

  return scores.map((rowScores) => {
    const reconstructed = new Array<number>(n).fill(0);
    for (let c = 0; c < componentCount; c++) {
      const loadings = result.components[c].loadings;
      for (let i = 0; i < n; i++) reconstructed[i] += rowScores[c] * loadings[i];
    }
    return reconstructed.map((value, i) => value + means[i]);
  });
}
