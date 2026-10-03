import { describe, it, expect } from "vitest";
import { eigenSymmetric, eigenvector } from "@/lib/math/eigen";
import {
  pcaFromCovariance, pcaFromData, principalComponentScores, reconstructFromComponents,
} from "@/lib/finance/pca";
import { covarianceFromCorrelation, matrixMultiply, transpose, identity } from "@/lib/math/linearAlgebra";
import { correlation, standardDeviation, mean } from "@/lib/statistics/descriptive";
import { seededNormal, mulberry32, normalSampler } from "@/lib/math/random";

describe("eigendecomposition", () => {
  it("diagonalises a diagonal matrix trivially", () => {
    const d = eigenSymmetric([[3, 0], [0, 1]]);
    expect(d.values[0]).toBeCloseTo(3, 12);
    expect(d.values[1]).toBeCloseTo(1, 12);
  });

  it("reproduces a hand-computable 2x2 case", () => {
    // [[2,1],[1,2]] has eigenvalues 3 and 1, eigenvectors (1,1)/√2 and (1,-1)/√2.
    const d = eigenSymmetric([[2, 1], [1, 2]]);
    expect(d.values[0]).toBeCloseTo(3, 12);
    expect(d.values[1]).toBeCloseTo(1, 12);
    const v1 = eigenvector(d, 0);
    expect(Math.abs(v1[0])).toBeCloseTo(Math.SQRT1_2, 10);
    expect(Math.abs(v1[1])).toBeCloseTo(Math.SQRT1_2, 10);
    // First eigenvector has both components the same sign; second has opposite.
    expect(Math.sign(v1[0] * v1[1])).toBe(1);
    const v2 = eigenvector(d, 1);
    expect(Math.sign(v2[0] * v2[1])).toBe(-1);
  });

  it("returns eigenvalues in descending order", () => {
    const cov = covarianceFromCorrelation(
      [[1, 0.5, 0.2], [0.5, 1, 0.3], [0.2, 0.3, 1]], [0.3, 0.2, 0.1],
    );
    const d = eigenSymmetric(cov);
    for (let i = 1; i < d.values.length; i++) {
      expect(d.values[i]).toBeLessThanOrEqual(d.values[i - 1]);
    }
  });

  it("satisfies the defining property A·v = λ·v", () => {
    // The only test that really matters: each eigenvector, multiplied by the
    // matrix, must come back scaled by its eigenvalue.
    const a = covarianceFromCorrelation(
      [[1, 0.7, -0.2, 0.4], [0.7, 1, 0.1, 0.3], [-0.2, 0.1, 1, -0.1], [0.4, 0.3, -0.1, 1]],
      [0.25, 0.18, 0.09, 0.3],
    );
    const d = eigenSymmetric(a);
    for (let k = 0; k < 4; k++) {
      const v = eigenvector(d, k);
      for (let i = 0; i < 4; i++) {
        let av = 0;
        for (let j = 0; j < 4; j++) av += a[i][j] * v[j];
        expect(av).toBeCloseTo(d.values[k] * v[i], 9);
      }
    }
  });

  it("produces orthonormal eigenvectors", () => {
    const a = covarianceFromCorrelation(
      [[1, 0.6, 0.2], [0.6, 1, -0.3], [0.2, -0.3, 1]], [0.2, 0.3, 0.15],
    );
    const d = eigenSymmetric(a);
    const vt = transpose(d.vectors);
    const product = matrixMultiply(vt, d.vectors);
    const i3 = identity(3);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) expect(product[i][j]).toBeCloseTo(i3[i][j], 10);
    }
  });

  it("conserves the trace: sum of eigenvalues equals sum of the diagonal", () => {
    const a = covarianceFromCorrelation(
      [[1, 0.4, 0.1], [0.4, 1, 0.5], [0.1, 0.5, 1]], [0.3, 0.2, 0.25],
    );
    const d = eigenSymmetric(a);
    const trace = a[0][0] + a[1][1] + a[2][2];
    expect(d.values.reduce((x, y) => x + y, 0)).toBeCloseTo(trace, 10);
  });

  it("gives a correlation matrix eigenvalues summing to its dimension", () => {
    // A correlation matrix has 1s on the diagonal, so the trace is n.
    const corr = [[1, 0.5, 0.3], [0.5, 1, 0.2], [0.3, 0.2, 1]];
    const d = eigenSymmetric(corr);
    expect(d.values.reduce((x, y) => x + y, 0)).toBeCloseTo(3, 10);
  });

  it("gives non-negative eigenvalues for a positive semi-definite matrix", () => {
    const cov = covarianceFromCorrelation(
      [[1, 0.9, 0.8], [0.9, 1, 0.85], [0.8, 0.85, 1]], [0.2, 0.22, 0.18],
    );
    for (const v of eigenSymmetric(cov).values) expect(v).toBeGreaterThan(-1e-12);
  });

  it("uses a deterministic sign convention", () => {
    const a = [[2, 1], [1, 2]];
    const first = eigenSymmetric(a);
    const second = eigenSymmetric(a);
    expect(first.vectors).toEqual(second.vectors);
    // Largest-magnitude component of each eigenvector is positive.
    for (let col = 0; col < 2; col++) {
      const v = eigenvector(first, col);
      const maxIdx = Math.abs(v[0]) >= Math.abs(v[1]) ? 0 : 1;
      expect(v[maxIdx]).toBeGreaterThan(0);
    }
  });

  it("converges", () => {
    const cov = covarianceFromCorrelation(
      [[1, 0.5, 0.3, 0.1], [0.5, 1, 0.4, 0.2], [0.3, 0.4, 1, 0.6], [0.1, 0.2, 0.6, 1]],
      [0.2, 0.25, 0.15, 0.3],
    );
    expect(eigenSymmetric(cov).converged).toBe(true);
  });

  it("rejects non-square and non-symmetric input", () => {
    expect(() => eigenSymmetric([[1, 2, 3], [4, 5, 6]])).toThrow();
    expect(() => eigenSymmetric([[1, 2], [3, 4]])).toThrow(/symmetric/);
  });

  it("handles the empty matrix", () => {
    const d = eigenSymmetric([]);
    expect(d.values).toEqual([]);
    expect(d.converged).toBe(true);
  });
});

describe("PCA", () => {
  it("gives each component an equal share for uncorrelated equal-variance data", () => {
    const pca = pcaFromCovariance(identity(4));
    for (const c of pca.components) expect(c.varianceExplained).toBeCloseTo(0.25, 10);
  });

  it("puts nearly everything in PC1 when variables are highly correlated", () => {
    const rho = 0.95;
    const cov = covarianceFromCorrelation(
      [[1, rho, rho], [rho, 1, rho], [rho, rho, 1]], [0.2, 0.2, 0.2],
    );
    const pca = pcaFromCovariance(cov);
    expect(pca.components[0].varianceExplained).toBeGreaterThan(0.95);
    expect(pca.componentsFor90Percent).toBe(1);
  });

  it("makes variance-explained fractions sum to 1", () => {
    const cov = covarianceFromCorrelation(
      [[1, 0.4, -0.2], [0.4, 1, 0.1], [-0.2, 0.1, 1]], [0.3, 0.2, 0.25],
    );
    const pca = pcaFromCovariance(cov);
    expect(pca.components.reduce((a, c) => a + c.varianceExplained, 0)).toBeCloseTo(1, 10);
    expect(pca.components[pca.components.length - 1].cumulativeVarianceExplained).toBeCloseTo(1, 10);
  });

  it("makes cumulative variance monotonically increase", () => {
    const cov = covarianceFromCorrelation(
      [[1, 0.6, 0.2, -0.1], [0.6, 1, 0.3, 0.1], [0.2, 0.3, 1, 0.4], [-0.1, 0.1, 0.4, 1]],
      [0.2, 0.3, 0.15, 0.25],
    );
    const pca = pcaFromCovariance(cov);
    for (let i = 1; i < pca.components.length; i++) {
      expect(pca.components[i].cumulativeVarianceExplained).toBeGreaterThanOrEqual(
        pca.components[i - 1].cumulativeVarianceExplained,
      );
    }
  });

  it("gives PC1 all-positive loadings when everything is positively correlated", () => {
    // This is the "market factor": when all assets move together, the first
    // component is everything rising and falling as one.
    const cov = covarianceFromCorrelation(
      [[1, 0.6, 0.5], [0.6, 1, 0.7], [0.5, 0.7, 1]], [0.2, 0.25, 0.18],
    );
    const loadings = pcaFromCovariance(cov).components[0].loadings;
    expect(loadings.every((l) => l > 0)).toBe(true);
  });

  it("recovers a known factor structure from simulated data", () => {
    // Build data where a single common factor drives everything, plus noise.
    // PC1 should capture the common factor and explain most of the variance.
    const normal = seededNormal(42);
    const data: number[][] = [];
    for (let t = 0; t < 4000; t++) {
      const factor = normal();
      data.push([
        1.0 * factor + 0.3 * normal(),
        0.8 * factor + 0.3 * normal(),
        1.2 * factor + 0.3 * normal(),
        0.9 * factor + 0.3 * normal(),
      ]);
    }
    const pca = pcaFromData(data);
    expect(pca.components[0].varianceExplained).toBeGreaterThan(0.8);
    expect(pca.components[0].loadings.every((l) => l > 0)).toBe(true);
    // The loadings should be roughly proportional to the factor exposures.
    const l = pca.components[0].loadings;
    expect(l[2]).toBeGreaterThan(l[1]); // 1.2 exposure beats 0.8
  });

  it("produces uncorrelated scores", () => {
    // The defining property of PCA: it rotates correlated variables into
    // uncorrelated ones.
    const rng = mulberry32(7);
    const normal = normalSampler(rng);
    const data: number[][] = [];
    for (let t = 0; t < 3000; t++) {
      const a = normal();
      const b = 0.8 * a + 0.6 * normal();
      const c = 0.5 * a + 0.5 * b + 0.7 * normal();
      data.push([a, b, c]);
    }
    const pca = pcaFromData(data);
    const scores = principalComponentScores(data, pca);
    const col = (i: number) => scores.map((r) => r[i]);
    expect(Math.abs(correlation(col(0), col(1)))).toBeLessThan(0.02);
    expect(Math.abs(correlation(col(0), col(2)))).toBeLessThan(0.02);
    expect(Math.abs(correlation(col(1), col(2)))).toBeLessThan(0.02);
  });

  it("gives score variances equal to the eigenvalues", () => {
    const normal = seededNormal(11);
    const data: number[][] = [];
    for (let t = 0; t < 5000; t++) {
      const f = normal();
      data.push([f + 0.4 * normal(), 0.7 * f + 0.4 * normal(), -0.5 * f + 0.4 * normal()]);
    }
    const pca = pcaFromData(data);
    const scores = principalComponentScores(data, pca);
    for (let k = 0; k < 3; k++) {
      const variance = standardDeviation(scores.map((r) => r[k]), 1) ** 2;
      expect(variance).toBeCloseTo(pca.eigenvalues[k], 2);
    }
  });

  it("reconstructs the data exactly when all components are used", () => {
    const normal = seededNormal(3);
    const data = Array.from({ length: 200 }, () => {
      const f = normal();
      return [f + 0.3 * normal(), 0.6 * f + 0.3 * normal(), 0.9 * f + 0.3 * normal()];
    });
    const pca = pcaFromData(data);
    const rebuilt = reconstructFromComponents(data, pca, 3);
    for (let t = 0; t < data.length; t++) {
      for (let i = 0; i < 3; i++) expect(rebuilt[t][i]).toBeCloseTo(data[t][i], 8);
    }
  });

  it("reconstructs approximately from fewer components, with error falling as more are added", () => {
    const normal = seededNormal(5);
    const data = Array.from({ length: 500 }, () => {
      const f = normal();
      return [f + 0.2 * normal(), 0.8 * f + 0.2 * normal(), 1.1 * f + 0.2 * normal()];
    });
    const pca = pcaFromData(data);
    const rmse = (k: number) => {
      const rebuilt = reconstructFromComponents(data, pca, k);
      let sum = 0;
      for (let t = 0; t < data.length; t++) {
        for (let i = 0; i < 3; i++) sum += (rebuilt[t][i] - data[t][i]) ** 2;
      }
      return Math.sqrt(sum / (data.length * 3));
    };
    expect(rmse(2)).toBeLessThan(rmse(1));
    expect(rmse(3)).toBeLessThan(rmse(2));
  });

  it("keeps correlations between variables and components within [-1, 1]", () => {
    const cov = covarianceFromCorrelation(
      [[1, 0.5, 0.3], [0.5, 1, 0.4], [0.3, 0.4, 1]], [0.3, 0.1, 0.22],
    );
    for (const c of pcaFromCovariance(cov).components) {
      for (const r of c.correlations) {
        expect(r).toBeGreaterThanOrEqual(-1 - 1e-9);
        expect(r).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("differs between covariance and correlation PCA when scales differ", () => {
    // One variable with far larger variance should dominate covariance PCA but
    // not correlation PCA. This is the choice the docs warn about.
    const normal = seededNormal(99);
    const data = Array.from({ length: 2000 }, () => [
      10 * normal(), // much larger scale
      normal(),
      normal(),
    ]);
    const cov = pcaFromData(data, false);
    const corr = pcaFromData(data, true);
    expect(cov.components[0].varianceExplained).toBeGreaterThan(0.9);
    expect(corr.components[0].varianceExplained).toBeLessThan(0.6);
  });

  it("rejects too little data", () => {
    expect(() => pcaFromData([[1, 2, 3]])).toThrow();
  });
});
