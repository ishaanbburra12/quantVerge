import { describe, it, expect } from "vitest";
import {
  portfolioExpectedReturn, portfolioVariance, portfolioVolatility, riskContributions,
  computePortfolioMetrics, normaliseWeights, randomLongOnlyWeights, generateRandomPortfolios,
  minimumVariancePortfolio, maxSharpePortfolio, efficientFrontier, simulatePortfolio,
  minimumVarianceAtReturn, frontierEnvelope,
  DEFAULT_ASSETS, DEFAULT_CORRELATION,
} from "@/lib/finance/portfolio";
import {
  covarianceFromCorrelation, correlationFromCovariance, cholesky, quadraticForm,
  isValidCorrelationMatrix, solve, invert, identity, matrixMultiply, transpose,
} from "@/lib/math/linearAlgebra";
import { mulberry32 } from "@/lib/math/random";
import { standardDeviation, correlation, mean } from "@/lib/statistics/descriptive";

describe("linear algebra", () => {
  it("builds a covariance matrix from correlations and volatilities", () => {
    const corr = [[1, 0.5], [0.5, 1]];
    const vols = [0.2, 0.3];
    const cov = covarianceFromCorrelation(corr, vols);
    expect(cov[0][0]).toBeCloseTo(0.04, 12);
    expect(cov[1][1]).toBeCloseTo(0.09, 12);
    expect(cov[0][1]).toBeCloseTo(0.5 * 0.2 * 0.3, 12);
    expect(cov[0][1]).toBe(cov[1][0]);
  });

  it("round-trips covariance back to correlation", () => {
    const corr = [[1, 0.37, -0.2], [0.37, 1, 0.1], [-0.2, 0.1, 1]];
    const cov = covarianceFromCorrelation(corr, [0.15, 0.25, 0.08]);
    const back = correlationFromCovariance(cov);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) expect(back[i][j]).toBeCloseTo(corr[i][j], 12);
    }
  });

  it("factors a matrix with Cholesky such that L * L^T recovers it", () => {
    const cov = covarianceFromCorrelation([[1, 0.6], [0.6, 1]], [0.2, 0.3]);
    const L = cholesky(cov);
    expect(L).not.toBeNull();
    const reconstructed = matrixMultiply(L!, transpose(L!));
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) expect(reconstructed[i][j]).toBeCloseTo(cov[i][j], 12);
    }
  });

  it("returns a lower-triangular Cholesky factor", () => {
    const L = cholesky([[4, 2], [2, 3]])!;
    expect(L[0][1]).toBe(0);
  });

  it("rejects a non-positive-definite matrix", () => {
    // Negative eigenvalue.
    expect(cholesky([[1, 2], [2, 1]])).toBeNull();
  });

  it("detects mutually inconsistent correlations", () => {
    // A-B +0.9, B-C +0.9, A-C -0.9 is geometrically impossible.
    const impossible = [[1, 0.9, -0.9], [0.9, 1, 0.9], [-0.9, 0.9, 1]];
    const result = isValidCorrelationMatrix(impossible);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/inconsistent/i);
  });

  it("accepts a valid correlation matrix including perfect correlation", () => {
    expect(isValidCorrelationMatrix([[1, 0.5], [0.5, 1]]).valid).toBe(true);
    expect(isValidCorrelationMatrix([[1, 1], [1, 1]]).valid).toBe(true);
  });

  it("rejects an asymmetric or badly-scaled correlation matrix", () => {
    expect(isValidCorrelationMatrix([[1, 0.5], [0.2, 1]]).valid).toBe(false);
    expect(isValidCorrelationMatrix([[1, 1.4], [1.4, 1]]).valid).toBe(false);
    expect(isValidCorrelationMatrix([[0.9, 0], [0, 1]]).valid).toBe(false);
  });

  it("solves a linear system", () => {
    // 2x + y = 5; x + 3y = 10  ->  x = 1, y = 3
    const x = solve([[2, 1], [1, 3]], [5, 10])!;
    expect(x[0]).toBeCloseTo(1, 10);
    expect(x[1]).toBeCloseTo(3, 10);
  });

  it("returns null for a singular system", () => {
    expect(solve([[1, 2], [2, 4]], [1, 2])).toBeNull();
  });

  it("inverts a matrix so that A * A^-1 = I", () => {
    const A = [[4, 7], [2, 6]];
    const inv = invert(A)!;
    const product = matrixMultiply(A, inv);
    const I = identity(2);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) expect(product[i][j]).toBeCloseTo(I[i][j], 10);
    }
  });
});

describe("portfolio return and variance", () => {
  const mu = [0.1, 0.05];
  const cov = covarianceFromCorrelation([[1, 0], [0, 1]], [0.2, 0.1]);

  it("computes expected return as a linear combination", () => {
    expect(portfolioExpectedReturn([0.5, 0.5], mu)).toBeCloseTo(0.075, 12);
    expect(portfolioExpectedReturn([1, 0], mu)).toBeCloseTo(0.1, 12);
  });

  it("is unaffected by correlation", () => {
    // Expected return depends only on weights and means.
    const covHigh = covarianceFromCorrelation([[1, 0.95], [0.95, 1]], [0.2, 0.1]);
    expect(portfolioExpectedReturn([0.5, 0.5], mu)).toBeCloseTo(
      portfolioExpectedReturn([0.5, 0.5], mu), 12,
    );
    expect(portfolioVariance([0.5, 0.5], covHigh)).toBeGreaterThan(portfolioVariance([0.5, 0.5], cov));
  });

  it("matches the hand-expanded two-asset variance formula", () => {
    const rho = 0.4;
    const s1 = 0.2;
    const s2 = 0.3;
    const w1 = 0.6;
    const w2 = 0.4;
    const c = covarianceFromCorrelation([[1, rho], [rho, 1]], [s1, s2]);
    const expected = w1 ** 2 * s1 ** 2 + w2 ** 2 * s2 ** 2 + 2 * w1 * w2 * rho * s1 * s2;
    expect(portfolioVariance([w1, w2], c)).toBeCloseTo(expected, 12);
  });

  it("gives exactly zero variance for a perfectly hedged rho = -1 pair", () => {
    // With rho = -1, weights proportional to the inverse of volatility cancel
    // the two assets' movements exactly.
    const s1 = 0.2;
    const s2 = 0.3;
    const c = covarianceFromCorrelation([[1, -1], [-1, 1]], [s1, s2]);
    const w1 = s2 / (s1 + s2);
    const w2 = s1 / (s1 + s2);
    expect(portfolioVariance([w1, w2], c)).toBeCloseTo(0, 12);
  });

  it("never returns a negative variance", () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const w = [rng() * 4 - 2, rng() * 4 - 2];
      expect(portfolioVariance(w, cov)).toBeGreaterThanOrEqual(0);
    }
  });

  it("shows diversification: equal weights beat the average of the parts", () => {
    // With uncorrelated assets of 20% vol each, a 50/50 mix has 14.1% vol.
    const c = covarianceFromCorrelation([[1, 0], [0, 1]], [0.2, 0.2]);
    const vol = portfolioVolatility([0.5, 0.5], c);
    expect(vol).toBeCloseTo(0.2 / Math.SQRT2, 10);
    expect(vol).toBeLessThan(0.2);
  });

  it("shows no diversification benefit at rho = 1", () => {
    const c = covarianceFromCorrelation([[1, 1], [1, 1]], [0.2, 0.2]);
    expect(portfolioVolatility([0.5, 0.5], c)).toBeCloseTo(0.2, 10);
  });

  it("falls monotonically in volatility as correlation decreases", () => {
    let previous = Infinity;
    for (const rho of [1, 0.5, 0, -0.5, -1]) {
      const c = covarianceFromCorrelation([[1, rho], [rho, 1]], [0.2, 0.2]);
      const vol = portfolioVolatility([0.5, 0.5], c);
      expect(vol).toBeLessThan(previous);
      previous = vol;
    }
  });

  it("equals the quadratic form it is defined by", () => {
    expect(portfolioVariance([0.3, 0.7], cov)).toBeCloseTo(quadraticForm([0.3, 0.7], cov), 12);
  });
});

describe("risk contributions", () => {
  it("sums to 1", () => {
    const cov = covarianceFromCorrelation(DEFAULT_CORRELATION, DEFAULT_ASSETS.map((a) => a.volatility));
    const w = [0.25, 0.25, 0.25, 0.25];
    const rc = riskContributions(w, cov);
    expect(rc.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("gives a volatile asset a larger risk share than its capital share", () => {
    const cov = covarianceFromCorrelation([[1, 0], [0, 1]], [0.4, 0.05]);
    const rc = riskContributions([0.5, 0.5], cov);
    expect(rc[0]).toBeGreaterThan(0.5);
    expect(rc[1]).toBeLessThan(0.5);
  });

  it("gives all risk to the only held asset", () => {
    const cov = covarianceFromCorrelation([[1, 0.3], [0.3, 1]], [0.2, 0.2]);
    const rc = riskContributions([1, 0], cov);
    expect(rc[0]).toBeCloseTo(1, 10);
    expect(rc[1]).toBeCloseTo(0, 10);
  });
});

describe("weights", () => {
  it("normalises to sum to 1", () => {
    expect(normaliseWeights([2, 2, 4]).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it("falls back to equal weights for an all-zero vector", () => {
    expect(normaliseWeights([0, 0, 0, 0])).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it("generates long-only weights that sum to 1 and are non-negative", () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 300; i++) {
      const w = randomLongOnlyWeights(4, rng);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
      for (const x of w) expect(x).toBeGreaterThanOrEqual(0);
    }
  });

  it("samples the simplex uniformly enough to reach the corners", () => {
    // A uniform Dirichlet sample should sometimes produce highly concentrated
    // portfolios. Naive uniform-and-normalise almost never does.
    const rng = mulberry32(17);
    let sawConcentrated = false;
    for (let i = 0; i < 5000; i++) {
      const w = randomLongOnlyWeights(3, rng);
      if (Math.max(...w) > 0.95) sawConcentrated = true;
    }
    expect(sawConcentrated).toBe(true);
  });
});

describe("random portfolio cloud", () => {
  const mu = DEFAULT_ASSETS.map((a) => a.expectedReturn);
  const cov = covarianceFromCorrelation(DEFAULT_CORRELATION, DEFAULT_ASSETS.map((a) => a.volatility));

  it("produces the requested count with consistent statistics", () => {
    const ps = generateRandomPortfolios(mu, cov, 500, 42, false, 0.02);
    expect(ps).toHaveLength(500);
    for (const p of ps) {
      expect(p.volatility).toBeGreaterThan(0);
      expect(p.expectedReturn).toBeGreaterThan(Math.min(...mu) - 1e-9);
      expect(p.expectedReturn).toBeLessThan(Math.max(...mu) + 1e-9);
      expect(p.sharpeRatio).toBeCloseTo((p.expectedReturn - 0.02) / p.volatility, 10);
    }
  });

  it("is reproducible for a fixed seed", () => {
    const a = generateRandomPortfolios(mu, cov, 100, 7);
    const b = generateRandomPortfolios(mu, cov, 100, 7);
    expect(a[50].weights).toEqual(b[50].weights);
  });

  it("can exceed the asset return range when short selling is allowed", () => {
    const ps = generateRandomPortfolios(mu, cov, 3000, 3, true);
    const maxAsset = Math.max(...mu);
    expect(ps.some((p) => p.expectedReturn > maxAsset)).toBe(true);
  });
});

describe("optimal portfolios", () => {
  const mu = DEFAULT_ASSETS.map((a) => a.expectedReturn);
  const cov = covarianceFromCorrelation(DEFAULT_CORRELATION, DEFAULT_ASSETS.map((a) => a.volatility));

  it("finds a minimum-variance portfolio whose weights sum to 1", () => {
    const w = minimumVariancePortfolio(cov)!;
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("gives the minimum-variance portfolio the lowest variance of any sample", () => {
    const w = minimumVariancePortfolio(cov)!;
    const minVar = portfolioVariance(w, cov);
    const ps = generateRandomPortfolios(mu, cov, 20000, 99, true);
    for (const p of ps) {
      expect(p.volatility ** 2).toBeGreaterThanOrEqual(minVar - 1e-9);
    }
  });

  it("puts the most weight on the lowest-volatility asset in a diagonal case", () => {
    const diagCov = covarianceFromCorrelation(identity(3), [0.05, 0.2, 0.4]);
    const w = minimumVariancePortfolio(diagCov)!;
    // For uncorrelated assets the minimum-variance weights are proportional to
    // 1/sigma_i^2, so the order should follow inverse variance.
    expect(w[0]).toBeGreaterThan(w[1]);
    expect(w[1]).toBeGreaterThan(w[2]);
    const expected = [1 / 0.05 ** 2, 1 / 0.2 ** 2, 1 / 0.4 ** 2];
    const total = expected.reduce((a, b) => a + b, 0);
    for (let i = 0; i < 3; i++) expect(w[i]).toBeCloseTo(expected[i] / total, 8);
  });

  it("finds a max-Sharpe portfolio that beats a large random sample", () => {
    const rf = 0.02;
    const w = maxSharpePortfolio(mu, cov, rf)!;
    const sharpe = (portfolioExpectedReturn(w, mu) - rf) / portfolioVolatility(w, cov);
    const ps = generateRandomPortfolios(mu, cov, 20000, 123, true, rf);
    for (const p of ps) expect(p.sharpeRatio).toBeLessThanOrEqual(sharpe + 1e-9);
  });

  it("returns null for a singular covariance matrix", () => {
    // Two perfectly correlated, identical assets make the system degenerate.
    const singular = covarianceFromCorrelation([[1, 1], [1, 1]], [0.2, 0.2]);
    expect(minimumVariancePortfolio(singular)).toBeNull();
  });
});

describe("efficient frontier", () => {
  const mu = DEFAULT_ASSETS.map((a) => a.expectedReturn);
  const cov = covarianceFromCorrelation(DEFAULT_CORRELATION, DEFAULT_ASSETS.map((a) => a.volatility));

  it("returns points whose weights sum to 1 and whose return matches the target", () => {
    const frontier = efficientFrontier(mu, cov, 25);
    expect(frontier.length).toBeGreaterThan(20);
    for (const point of frontier) {
      expect(point.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 8);
      expect(portfolioExpectedReturn(point.weights, mu)).toBeCloseTo(point.expectedReturn, 8);
    }
  });

  it("achieves its minimum volatility at the minimum-variance portfolio", () => {
    const frontier = efficientFrontier(mu, cov, 120);
    const frontierMin = Math.min(...frontier.map((p) => p.volatility));
    const mvpVol = portfolioVolatility(minimumVariancePortfolio(cov)!, cov);
    expect(frontierMin).toBeGreaterThanOrEqual(mvpVol - 1e-6);
    expect(frontierMin).toBeLessThan(mvpVol * 1.02);
  });

  it("is convex: volatility falls then rises as return increases", () => {
    const frontier = efficientFrontier(mu, cov, 80);
    const vols = frontier.map((p) => p.volatility);
    const minIndex = vols.indexOf(Math.min(...vols));
    for (let i = 1; i <= minIndex; i++) expect(vols[i]).toBeLessThanOrEqual(vols[i - 1] + 1e-9);
    for (let i = minIndex + 1; i < vols.length; i++) expect(vols[i]).toBeGreaterThanOrEqual(vols[i - 1] - 1e-9);
  });

  it("dominates the random cloud: no random portfolio beats it at the same risk", () => {
    const ps = generateRandomPortfolios(mu, cov, 8000, 55, true);

    // Compare each random portfolio against the EXACT minimum-variance
    // portfolio at its own expected return, rather than against the nearest
    // point on a discretised curve. The frontier is sampled at only ~200 target
    // returns, and because it is steep at the ends, the nearest sampled point
    // can sit a fraction of a percent away in return — enough to make a
    // genuinely efficient frontier look as though it were being beaten.
    for (const p of ps) {
      const optimal = minimumVarianceAtReturn(mu, cov, p.expectedReturn);
      expect(optimal).not.toBeNull();
      const optimalVol = portfolioVolatility(optimal!, cov);
      expect(optimalVol).toBeLessThanOrEqual(p.volatility + 1e-9);
      // And it genuinely achieves the target return.
      expect(portfolioExpectedReturn(optimal!, mu)).toBeCloseTo(p.expectedReturn, 9);
    }
  });

  it("spans at least the range of the individual asset returns", () => {
    const frontier = efficientFrontier(mu, cov, 60);
    expect(Math.min(...frontier.map((p) => p.expectedReturn))).toBeLessThanOrEqual(Math.min(...mu));
    expect(Math.max(...frontier.map((p) => p.expectedReturn))).toBeGreaterThanOrEqual(Math.max(...mu));
  });
});

describe("portfolio simulation", () => {
  const mu = [0.1, 0.06];
  it("realises the analytic volatility over a long simulation", () => {
    const cov = covarianceFromCorrelation([[1, 0.3], [0.3, 1]], [0.25, 0.15]);
    const w = [0.6, 0.4];
    const sim = simulatePortfolio(w, mu, cov, 150000, 42)!;
    expect(sim).not.toBeNull();
    const realised = standardDeviation(sim.returns, 1) * Math.sqrt(252);
    const analytic = portfolioVolatility(w, cov);
    expect(realised / analytic).toBeGreaterThan(0.95);
    expect(realised / analytic).toBeLessThan(1.05);
  });

  it("realises the requested correlation between asset paths", () => {
    const targetRho = 0.7;
    const cov = covarianceFromCorrelation([[1, targetRho], [targetRho, 1]], [0.2, 0.2]);
    const sim = simulatePortfolio([0.5, 0.5], mu, cov, 100000, 8)!;
    const r0 = sim.assetPaths[0].slice(1).map((p, i) => p / sim.assetPaths[0][i] - 1);
    const r1 = sim.assetPaths[1].slice(1).map((p, i) => p / sim.assetPaths[1][i] - 1);
    expect(correlation(r0, r1)).toBeCloseTo(targetRho, 1);
  });

  it("produces an equity curve consistent with its return series", () => {
    const cov = covarianceFromCorrelation([[1, 0.2], [0.2, 1]], [0.2, 0.1]);
    const sim = simulatePortfolio([0.5, 0.5], mu, cov, 500, 3)!;
    let equity = 1;
    for (const r of sim.returns) equity *= 1 + r;
    expect(sim.equity[sim.equity.length - 1]).toBeCloseTo(equity, 8);
  });

  it("returns null when the covariance matrix cannot be factored", () => {
    const bad = [[1, 2], [2, 1]];
    expect(simulatePortfolio([0.5, 0.5], mu, bad, 10, 1)).toBeNull();
  });

  it("is reproducible", () => {
    const cov = covarianceFromCorrelation([[1, 0.2], [0.2, 1]], [0.2, 0.1]);
    const a = simulatePortfolio([0.5, 0.5], mu, cov, 100, 77)!;
    const b = simulatePortfolio([0.5, 0.5], mu, cov, 100, 77)!;
    expect(a.equity).toEqual(b.equity);
  });
});

describe("computePortfolioMetrics", () => {
  it("reports a diversification ratio below 1 for imperfectly correlated assets", () => {
    const cov = covarianceFromCorrelation([[1, 0.2], [0.2, 1]], [0.2, 0.2]);
    const m = computePortfolioMetrics([0.5, 0.5], [0.1, 0.08], cov, 0.02);
    expect(m.diversificationRatio).toBeLessThan(1);
  });

  it("reports a diversification ratio of 1 at perfect correlation", () => {
    const cov = covarianceFromCorrelation([[1, 1], [1, 1]], [0.2, 0.2]);
    const m = computePortfolioMetrics([0.5, 0.5], [0.1, 0.08], cov, 0.02);
    expect(m.diversificationRatio).toBeCloseTo(1, 8);
  });

  it("computes Sharpe consistently with its own return and volatility", () => {
    const cov = covarianceFromCorrelation(DEFAULT_CORRELATION, DEFAULT_ASSETS.map((a) => a.volatility));
    const m = computePortfolioMetrics([0.4, 0.3, 0.2, 0.1], DEFAULT_ASSETS.map((a) => a.expectedReturn), cov, 0.03);
    expect(m.sharpeRatio).toBeCloseTo((m.expectedReturn - 0.03) / m.volatility, 10);
  });
});

describe("frontierEnvelope", () => {
  const mu = DEFAULT_ASSETS.map((a) => a.expectedReturn);
  const cov = covarianceFromCorrelation(DEFAULT_CORRELATION, DEFAULT_ASSETS.map((a) => a.volatility));

  it("returns a curve whose expected return increases monotonically with volatility", () => {
    // This is the defining property of an efficient frontier. The raw upper
    // envelope of a cloud does NOT have it: at the highest volatilities the
    // best available portfolio is often a concentrated position in a risky but
    // mediocre asset, so the envelope turns back downward. Those points are
    // dominated and must not be presented as efficient.
    const cloud = generateRandomPortfolios(mu, cov, 8000, 7, false);
    const envelope = frontierEnvelope(cloud, 50);
    expect(envelope.length).toBeGreaterThan(3);
    for (let i = 1; i < envelope.length; i++) {
      expect(envelope[i].volatility).toBeGreaterThan(envelope[i - 1].volatility);
      expect(envelope[i].expectedReturn).toBeGreaterThan(envelope[i - 1].expectedReturn);
    }
  });

  it("contains no portfolio dominated by another in the same envelope", () => {
    const cloud = generateRandomPortfolios(mu, cov, 6000, 19, false);
    const envelope = frontierEnvelope(cloud, 40);
    for (const a of envelope) {
      for (const b of envelope) {
        if (a === b) continue;
        const dominated = b.volatility <= a.volatility && b.expectedReturn >= a.expectedReturn;
        expect(dominated).toBe(false);
      }
    }
  });

  it("starts at or near the lowest-volatility portfolio in the cloud", () => {
    const cloud = generateRandomPortfolios(mu, cov, 6000, 23, false);
    const envelope = frontierEnvelope(cloud, 40);
    const cloudMinVol = Math.min(...cloud.map((p) => p.volatility));
    expect(envelope[0].volatility).toBeLessThan(cloudMinVol * 1.15);
  });

  it("handles degenerate inputs", () => {
    expect(frontierEnvelope([], 20)).toEqual([]);
    const single = generateRandomPortfolios(mu, cov, 1, 1, false);
    expect(frontierEnvelope(single, 20)).toHaveLength(1);
  });
});
