/**
 * Portfolio mathematics: Markowitz mean-variance analysis.
 *
 * The 1952 insight that founded the field: an asset should not be judged on its
 * own risk and return, but on what it does to the risk and return of the
 * portfolio you already hold. A volatile asset can REDUCE total risk if it zigs
 * when the rest zags.
 */

import { quadraticForm, dot, covarianceFromCorrelation, cholesky, type Matrix, type Vector } from "@/lib/math/linearAlgebra";
import { mulberry32, normalSampler } from "@/lib/math/random";

export interface Asset {
  id: string;
  name: string;
  /** Expected annual return, as a decimal. */
  expectedReturn: number;
  /** Annual volatility, as a decimal. Must be > 0. */
  volatility: number;
  color: string;
}

export interface PortfolioMetrics {
  weights: Vector;
  expectedReturn: number;
  variance: number;
  volatility: number;
  sharpeRatio: number;
  /**
   * Each asset's share of total portfolio RISK (not of capital). Sums to 1.
   */
  riskContributions: Vector;
  /**
   * The ratio of actual portfolio volatility to the weighted average of the
   * assets' volatilities. Below 1 means diversification is working.
   */
  diversificationRatio: number;
}

/**
 * Expected portfolio return: E(R_p) = w^T * mu.
 *
 * This one is exactly linear — expectation is a linear operator, so the expected
 * return of a weighted sum is the weighted sum of expected returns, with no
 * correction terms and no dependence on correlation whatsoever. Combining assets
 * never creates or destroys expected return.
 *
 * Risk is where the interesting behaviour lives.
 */
export function portfolioExpectedReturn(weights: Vector, expectedReturns: Vector): number {
  if (weights.length !== expectedReturns.length) {
    throw new Error("portfolioExpectedReturn: dimension mismatch");
  }
  return dot(weights, expectedReturns);
}

/**
 * Portfolio variance: sigma_p^2 = w^T * Sigma * w.
 *
 * Unlike return, this is NOT linear — it is quadratic, and the cross terms are
 * where diversification comes from. For two assets it expands to
 *
 *   sigma_p^2 = w1^2*sigma1^2 + w2^2*sigma2^2 + 2*w1*w2*rho*sigma1*sigma2
 *
 * Look at the last term. It carries rho, and rho can be negative. When it is,
 * the term SUBTRACTS from total variance, and the portfolio is less risky than
 * either of its parts. In the limit rho = -1 with the right weights, the
 * variance goes to exactly zero: the two assets' movements cancel perfectly.
 *
 * This is the one genuinely free lunch in finance, and it comes from the
 * algebraic fact that variances add with a cross term while expected returns
 * simply add.
 */
export function portfolioVariance(weights: Vector, covariance: Matrix): number {
  // Variance is a sum of squares in disguise; clamp away floating-point noise
  // so a near-zero result cannot become a NaN under the square root.
  return Math.max(0, quadraticForm(weights, covariance));
}

export function portfolioVolatility(weights: Vector, covariance: Matrix): number {
  return Math.sqrt(portfolioVariance(weights, covariance));
}

/**
 * Marginal and component risk contributions.
 *
 * The MARGINAL contribution of asset i is d(sigma_p) / d(w_i), which works out
 * to (Sigma w)_i / sigma_p. Multiplying by the weight gives the COMPONENT
 * contribution, and by Euler's theorem for homogeneous functions these sum
 * exactly to sigma_p. Dividing through by sigma_p gives fractions summing to 1.
 *
 * Why this matters: capital allocation and risk allocation are different things.
 * A 10% position in a volatile, highly-correlated asset can easily account for
 * 40% of portfolio risk. Only this calculation reveals that.
 */
export function riskContributions(weights: Vector, covariance: Matrix): Vector {
  const sigma = portfolioVolatility(weights, covariance);
  if (sigma === 0) return weights.map(() => 0);
  const n = weights.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let marginal = 0;
    for (let j = 0; j < n; j++) marginal += covariance[i][j] * weights[j];
    out.push((weights[i] * marginal) / (sigma * sigma));
  }
  return out;
}

export function computePortfolioMetrics(
  weights: Vector,
  expectedReturns: Vector,
  covariance: Matrix,
  riskFreeRate = 0,
): PortfolioMetrics {
  const expectedReturn = portfolioExpectedReturn(weights, expectedReturns);
  const variance = portfolioVariance(weights, covariance);
  const volatility = Math.sqrt(variance);

  const weightedAverageVol = weights.reduce(
    (acc, w, i) => acc + Math.abs(w) * Math.sqrt(Math.max(0, covariance[i][i])),
    0,
  );

  return {
    weights,
    expectedReturn,
    variance,
    volatility,
    sharpeRatio: volatility > 0 ? (expectedReturn - riskFreeRate) / volatility : 0,
    riskContributions: riskContributions(weights, covariance),
    diversificationRatio: weightedAverageVol > 0 ? volatility / weightedAverageVol : 1,
  };
}

/** Normalise weights so they sum to 1 — the budget constraint. */
export function normaliseWeights(weights: Vector): Vector {
  const total = weights.reduce((a, b) => a + b, 0);
  if (Math.abs(total) < 1e-12) return weights.map(() => 1 / weights.length);
  return weights.map((w) => w / total);
}

/**
 * Random weights on the simplex (non-negative, summing to 1).
 *
 * Generated by drawing from an exponential distribution and normalising, which
 * is the standard construction for a uniform Dirichlet(1,...,1) sample. Simply
 * drawing uniforms and normalising does NOT give a uniform distribution over the
 * simplex — it concentrates near the centre and under-samples the corners, which
 * would systematically miss the concentrated portfolios near the frontier's
 * ends.
 */
export function randomLongOnlyWeights(n: number, rng: () => number): Vector {
  const draws: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    // -ln(U) is Exponential(1).
    let u = rng();
    while (u <= Number.EPSILON) u = rng();
    const e = -Math.log(u);
    draws.push(e);
    total += e;
  }
  return draws.map((d) => d / total);
}

/** Random weights allowing short positions (any sign), summing to 1. */
export function randomUnconstrainedWeights(n: number, normal: () => number): Vector {
  const draws = Array.from({ length: n }, () => normal());
  const total = draws.reduce((a, b) => a + b, 0);
  // A total near zero would produce absurdly leveraged weights; retry logic is
  // handled by the caller via resampling, but guard anyway.
  if (Math.abs(total) < 1e-6) return new Array(n).fill(1 / n);
  return draws.map((d) => d / total);
}

export interface RandomPortfolio {
  weights: Vector;
  volatility: number;
  expectedReturn: number;
  sharpeRatio: number;
}

/**
 * Monte Carlo the feasible set: generate many random portfolios and record where
 * each lands in (risk, return) space.
 *
 * The resulting cloud has a characteristic bullet shape whose upper-left edge is
 * the EFFICIENT FRONTIER: the portfolios with the highest return for their level
 * of risk. Nothing can exist above and to the left of it, and everything inside
 * it is dominated — for any interior point there is a frontier portfolio with the
 * same risk and more return.
 *
 * Random sampling is not how you would compute a frontier in production (that is
 * a quadratic program, solved analytically below), but it is far more
 * instructive: you SEE the whole opportunity set, and you see that the frontier
 * is an upper boundary rather than an arbitrary curve.
 */
export function generateRandomPortfolios(
  expectedReturns: Vector,
  covariance: Matrix,
  count: number,
  seed: number,
  allowShortSelling = false,
  riskFreeRate = 0,
): RandomPortfolio[] {
  const rng = mulberry32(seed);
  const normal = normalSampler(rng);
  const n = expectedReturns.length;
  const out: RandomPortfolio[] = [];

  for (let i = 0; i < count; i++) {
    const weights = allowShortSelling ? randomUnconstrainedWeights(n, normal) : randomLongOnlyWeights(n, rng);
    const vol = portfolioVolatility(weights, covariance);
    const ret = portfolioExpectedReturn(weights, expectedReturns);
    out.push({
      weights,
      volatility: vol,
      expectedReturn: ret,
      sharpeRatio: vol > 0 ? (ret - riskFreeRate) / vol : 0,
    });
  }
  return out;
}

/**
 * The global minimum-variance portfolio, in closed form.
 *
 * Minimising w^T*Sigma*w subject to w^T*1 = 1 with a Lagrange multiplier gives
 *
 *   w = (Sigma^-1 * 1) / (1^T * Sigma^-1 * 1)
 *
 * This permits short selling. Note that it does not involve expected returns at
 * all — the lowest-risk portfolio depends only on the covariance structure,
 * which is a genuinely useful property, because covariances can be estimated far
 * more reliably from data than expected returns can.
 *
 * Returns null if Sigma is singular (for example, two perfectly correlated
 * assets, which makes the system degenerate).
 */
export function minimumVariancePortfolio(covariance: Matrix): Vector | null {
  const n = covariance.length;
  const ones = new Array(n).fill(1);
  const { solve } = requireSolver();
  const z = solve(covariance, ones);
  if (z === null) return null;
  const total = z.reduce((a, b) => a + b, 0);
  if (Math.abs(total) < 1e-14) return null;
  return z.map((v) => v / total);
}

/**
 * The maximum-Sharpe ("tangency") portfolio, in closed form.
 *
 *   w proportional to Sigma^-1 * (mu - r_f * 1)
 *
 * then normalised to sum to 1. Geometrically this is the point where a line
 * drawn from the risk-free rate is tangent to the efficient frontier — the
 * steepest achievable risk-return trade-off.
 *
 * Its practical weakness is severe and worth internalising: it depends on
 * Sigma^-1 multiplied by estimated expected returns, and matrix inversion
 * amplifies estimation error. Small changes in the mu you feed it can produce
 * wildly different, often extreme, weights. This instability is the main reason
 * naive Markowitz optimisation performs poorly out of sample, and why
 * practitioners add constraints, shrink their estimates, or fall back to the
 * minimum-variance portfolio.
 */
export function maxSharpePortfolio(expectedReturns: Vector, covariance: Matrix, riskFreeRate = 0): Vector | null {
  const excess = expectedReturns.map((r) => r - riskFreeRate);
  const { solve } = requireSolver();
  const z = solve(covariance, excess);
  if (z === null) return null;
  const total = z.reduce((a, b) => a + b, 0);
  if (Math.abs(total) < 1e-14) return null;
  return z.map((v) => v / total);
}

// Imported lazily to keep the module graph acyclic and readable.
function requireSolver() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return { solve: solveLinearSystem };
}

import { solve as solveLinearSystem } from "@/lib/math/linearAlgebra";

export interface FrontierPoint {
  volatility: number;
  expectedReturn: number;
  weights: Vector;
}

/**
 * The efficient frontier, computed properly rather than sampled.
 *
 * For each target return we solve the constrained minimisation
 *   min w^T*Sigma*w  subject to  w^T*mu = target  and  w^T*1 = 1.
 *
 * With two equality constraints and two Lagrange multipliers this becomes a
 * linear system of size (n + 2), which we assemble as a block matrix:
 *
 *   [ 2*Sigma   mu   1 ] [ w      ]   [ 0      ]
 *   [ mu^T       0   0 ] [ -lam1  ] = [ target ]
 *   [ 1^T        0   0 ] [ -lam2  ]   [ 1      ]
 *
 * The solution traces a parabola in (variance, return) space, which becomes the
 * familiar hyperbola in (volatility, return) space.
 *
 * This version permits short selling, since that is what has a closed form.
 * With a no-short constraint the problem needs genuine quadratic programming, so
 * for that case the UI relies on the random-portfolio cloud's upper envelope
 * instead, which is honest about being an approximation.
 */
export function minimumVarianceAtReturn(
  expectedReturns: Vector,
  covariance: Matrix,
  targetReturn: number,
): Vector | null {
  const n = expectedReturns.length;
  const size = n + 2;
  const A: Matrix = Array.from({ length: size }, () => new Array(size).fill(0));
  const b: Vector = new Array(size).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) A[i][j] = 2 * covariance[i][j];
    A[i][n] = expectedReturns[i];
    A[i][n + 1] = 1;
  }
  for (let j = 0; j < n; j++) {
    A[n][j] = expectedReturns[j];
    A[n + 1][j] = 1;
  }
  b[n] = targetReturn;
  b[n + 1] = 1;

  const solution = solveLinearSystem(A, b);
  if (solution === null) return null;
  return solution.slice(0, n);
}

export function efficientFrontier(
  expectedReturns: Vector,
  covariance: Matrix,
  points = 60,
): FrontierPoint[] {
  const minRet = Math.min(...expectedReturns);
  const maxRet = Math.max(...expectedReturns);
  const spread = maxRet - minRet;
  // Extend past the asset range: with short selling you can achieve returns
  // outside it, and the curve's shape is clearer with the extra span shown.
  const lo = minRet - spread * 0.25;
  const hi = maxRet + spread * 0.25;

  const out: FrontierPoint[] = [];
  for (let k = 0; k < points; k++) {
    const target = lo + ((hi - lo) * k) / Math.max(1, points - 1);
    const weights = minimumVarianceAtReturn(expectedReturns, covariance, target);
    if (weights === null) continue;
    const vol = portfolioVolatility(weights, covariance);
    if (!Number.isFinite(vol)) continue;
    out.push({ volatility: vol, expectedReturn: target, weights });
  }
  return out;
}

/**
 * Approximate the efficient frontier from a point cloud, for cases where no
 * closed form exists (such as a no-short-selling constraint).
 *
 * Two steps, and the second one matters:
 *
 * 1. Take the upper envelope — divide the volatility axis into thin bands and
 *    keep the highest-return portfolio in each.
 *
 * 2. Trim the envelope to its EFFICIENT portion. The raw upper envelope keeps
 *    rising, peaking, and then falling again at high volatility, because the
 *    highest-volatility portfolios are concentrated in a single risky asset that
 *    may not have the highest return. Those trailing points are on the boundary
 *    of the feasible set, but they are *dominated*: another portfolio offers
 *    more return for less risk, so no rational investor would hold them. They
 *    are not part of the efficient frontier, and drawing them as though they
 *    were misrepresents the central concept of the whole chart.
 *
 * We therefore walk left to right from the minimum-variance point and keep only
 * portfolios that strictly improve on the best return seen so far.
 */
export function frontierEnvelope(portfolios: RandomPortfolio[], bands = 50): RandomPortfolio[] {
  if (portfolios.length === 0) return [];
  const vols = portfolios.map((p) => p.volatility);
  const lo = Math.min(...vols);
  const hi = Math.max(...vols);
  if (hi === lo) return [portfolios[0]];

  const width = (hi - lo) / bands;
  const best = new Map<number, RandomPortfolio>();
  for (const p of portfolios) {
    const band = Math.min(bands - 1, Math.floor((p.volatility - lo) / width));
    const current = best.get(band);
    if (!current || p.expectedReturn > current.expectedReturn) best.set(band, p);
  }

  const envelope = [...best.values()].sort((a, b) => a.volatility - b.volatility);

  // Keep only the non-dominated, upward-sloping portion.
  const efficient: RandomPortfolio[] = [];
  let bestReturn = -Infinity;
  for (const point of envelope) {
    if (point.expectedReturn > bestReturn) {
      efficient.push(point);
      bestReturn = point.expectedReturn;
    }
  }
  return efficient;
}

/**
 * Simulate correlated asset return paths, used to show that the analytic
 * portfolio statistics actually describe realised behaviour.
 *
 * Correlation is imposed via the Cholesky factor: x = L * z turns independent
 * normals z into normals with covariance L*L^T = Sigma.
 */
export interface SimulatedPortfolio {
  /** Portfolio value over time, starting at 1. */
  equity: number[];
  /** Per-period portfolio returns. */
  returns: number[];
  /** Per-asset price paths, each starting at 1. */
  assetPaths: number[][];
}

export function simulatePortfolio(
  weights: Vector,
  expectedReturns: Vector,
  covariance: Matrix,
  steps: number,
  seed: number,
  periodsPerYear = 252,
): SimulatedPortfolio | null {
  const n = weights.length;
  const L = cholesky(covariance.map((row, i) => row.map((v, j) => (i === j ? v + 1e-12 : v))));
  if (L === null) return null;

  const normal = normalSampler(mulberry32(seed));
  const dt = 1 / periodsPerYear;
  const sqrtDt = Math.sqrt(dt);

  const assetPaths: number[][] = Array.from({ length: n }, () => [1]);
  const portfolioEquity = [1];
  const portfolioReturns: number[] = [];

  for (let t = 0; t < steps; t++) {
    const z = Array.from({ length: n }, () => normal());
    // Correlated shocks: row i of L dotted with z.
    let periodReturn = 0;
    for (let i = 0; i < n; i++) {
      let shock = 0;
      for (let j = 0; j <= i; j++) shock += L[i][j] * z[j];
      // Ito-corrected log step, matching the GBM convention used elsewhere.
      const vol = Math.sqrt(Math.max(0, covariance[i][i]));
      const logStep = (expectedReturns[i] - (vol * vol) / 2) * dt + shock * sqrtDt;
      const prev = assetPaths[i][assetPaths[i].length - 1];
      const next = prev * Math.exp(logStep);
      assetPaths[i].push(next);
      // Portfolio return uses SIMPLE returns, because simple returns are what
      // aggregate linearly across assets. Using log returns here would be wrong.
      periodReturn += weights[i] * (next / prev - 1);
    }
    portfolioReturns.push(periodReturn);
    portfolioEquity.push(portfolioEquity[portfolioEquity.length - 1] * (1 + periodReturn));
  }

  return { equity: portfolioEquity, returns: portfolioReturns, assetPaths };
}

export { covarianceFromCorrelation };

export const DEFAULT_ASSETS: Asset[] = [
  { id: "a", name: "Growth Equity", expectedReturn: 0.12, volatility: 0.22, color: "var(--series-1)" },
  { id: "b", name: "Value Equity", expectedReturn: 0.085, volatility: 0.16, color: "var(--series-2)" },
  { id: "c", name: "Government Bonds", expectedReturn: 0.035, volatility: 0.06, color: "var(--series-3)" },
  { id: "d", name: "Commodities", expectedReturn: 0.06, volatility: 0.25, color: "var(--series-4)" },
];

export const DEFAULT_CORRELATION: Matrix = [
  [1.0, 0.72, -0.12, 0.25],
  [0.72, 1.0, -0.05, 0.3],
  [-0.12, -0.05, 1.0, -0.08],
  [0.25, 0.3, -0.08, 1.0],
];
