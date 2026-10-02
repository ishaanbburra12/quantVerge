import { describe, it, expect } from "vitest";
import { mulberry32, seededNormal, sampleDiscrete } from "@/lib/math/random";
import {
  generateGBM, generateGBMPaths, generateAR1, generateRegimeMarket, generateJumpDiffusion,
  simulateTerminalStats, stationaryDistribution, validateTransitionMatrix, normaliseRow,
  generateOrnsteinUhlenbeck, DEFAULT_REGIMES, DEFAULT_TRANSITION,
} from "@/lib/simulation/generators";
import { mean, standardDeviation, autocorrelation, correlation } from "@/lib/statistics/descriptive";
import { logReturns } from "@/lib/finance/performance";
import { generateRiskSeries } from "@/lib/simulation/riskProcesses";

describe("seeded randomness", () => {
  it("produces identical sequences for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it("produces different sequences for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const sameCount = Array.from({ length: 50 }, () => (a() === b() ? 1 : 0)).reduce<number>((x, y) => x + y, 0);
    expect(sameCount).toBe(0);
  });

  it("stays within [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 20000; i++) {
      const u = rng();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it("is approximately uniform", () => {
    const rng = mulberry32(13);
    const draws = Array.from({ length: 200000 }, () => rng());
    expect(mean(draws)).toBeCloseTo(0.5, 2);
    // Uniform(0,1) has variance 1/12 = 0.08333.
    expect(standardDeviation(draws, 1) ** 2).toBeCloseTo(1 / 12, 3);
  });
});

describe("normal sampling", () => {
  it("has approximately mean 0 and sd 1", () => {
    const normal = seededNormal(123);
    const draws = Array.from({ length: 200000 }, () => normal());
    expect(mean(draws)).toBeCloseTo(0, 2);
    expect(standardDeviation(draws, 1)).toBeCloseTo(1, 2);
  });

  it("puts roughly 68% of draws within one standard deviation", () => {
    const normal = seededNormal(555);
    const draws = Array.from({ length: 100000 }, () => normal());
    const within = draws.filter((z) => Math.abs(z) <= 1).length / draws.length;
    expect(within).toBeGreaterThan(0.67);
    expect(within).toBeLessThan(0.69);
  });

  it("puts roughly 95% of draws within two standard deviations", () => {
    const normal = seededNormal(556);
    const draws = Array.from({ length: 100000 }, () => normal());
    const within = draws.filter((z) => Math.abs(z) <= 1.96).length / draws.length;
    expect(within).toBeGreaterThan(0.945);
    expect(within).toBeLessThan(0.955);
  });

  it("is reproducible", () => {
    const a = seededNormal(9);
    const b = seededNormal(9);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });
});

describe("sampleDiscrete", () => {
  it("respects the given probabilities", () => {
    // Tolerance is derived from the sampling error, not guessed: the count of
    // each outcome is Binomial(n, p), so the observed frequency has standard
    // error sqrt(p(1-p)/n). Allowing 4 standard errors makes a false failure
    // astronomically unlikely while still catching any real bias.
    const n = 200000;
    const probabilities = [0.2, 0.5, 0.3];
    const rng = mulberry32(31);
    const counts = [0, 0, 0];
    for (let i = 0; i < n; i++) counts[sampleDiscrete(probabilities, rng)]++;
    probabilities.forEach((p, i) => {
      const standardError = Math.sqrt((p * (1 - p)) / n);
      expect(Math.abs(counts[i] / n - p)).toBeLessThan(4 * standardError);
    });
  });

  it("never selects a zero-probability outcome", () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 5000; i++) expect(sameOrNot(sampleDiscrete([0.5, 0, 0.5], rng))).not.toBe(1);
  });

  it("rejects all-zero weights", () => {
    expect(() => sampleDiscrete([0, 0], mulberry32(1))).toThrow();
  });
});
function sameOrNot(x: number) { return x; }

describe("geometric Brownian motion", () => {
  const params = { initialPrice: 100, drift: 0.08, volatility: 0.2, steps: 252, horizonYears: 1, seed: 42 };

  it("starts at the initial price and has steps+1 points", () => {
    const path = generateGBM(params);
    expect(path[0]).toBe(100);
    expect(path).toHaveLength(253);
  });

  it("stays strictly positive", () => {
    // Even with extreme volatility, the exponential form cannot go negative.
    const path = generateGBM({ ...params, volatility: 2.5, seed: 77 });
    for (const p of path) expect(p).toBeGreaterThan(0);
  });

  it("is reproducible for a fixed seed", () => {
    expect(generateGBM(params)).toEqual(generateGBM(params));
  });

  it("differs for a different seed", () => {
    expect(generateGBM(params)).not.toEqual(generateGBM({ ...params, seed: 43 }));
  });

  it("produces a flat path at zero volatility, growing at exactly exp(mu*t)", () => {
    const path = generateGBM({ ...params, volatility: 0 });
    const expected = 100 * Math.exp(0.08);
    expect(path[252]).toBeCloseTo(expected, 8);
  });

  it("has E[S_T] = S_0 * exp(mu * T), confirming the Ito correction", () => {
    // This is the key test for the -sigma^2/2 term. Without it, the realised
    // mean would be inflated by exp(sigma^2 * T / 2) ~ 2% here.
    const { endingPrices } = simulateTerminalStats({ ...params, seed: 2024 }, 60000);
    const theoretical = 100 * Math.exp(0.08 * 1);
    const observed = mean(endingPrices);
    // Standard error of the mean is sd/sqrt(n); allow a generous 1.5% band.
    expect(observed / theoretical).toBeGreaterThan(0.985);
    expect(observed / theoretical).toBeLessThan(1.015);
  });

  it("has log returns with the theoretical mean and standard deviation", () => {
    // Under GBM, each log return is exactly N((mu - sigma^2/2)*dt, sigma^2*dt).
    // The sample mean of n of them therefore has standard error
    // sigma*sqrt(dt)/sqrt(n), and that — not an arbitrary decimal place — is
    // the right scale for the tolerance. A fixed tolerance tighter than the
    // sampling error would fail on unlucky seeds even for a correct generator.
    const n = 200000;
    const path = generateGBM({ ...params, steps: n, horizonYears: n / 252, seed: 8 });
    const lr = logReturns(path);
    const dt = 1 / 252;
    const theoreticalMean = (0.08 - 0.2 ** 2 / 2) * dt;
    const theoreticalSd = 0.2 * Math.sqrt(dt);
    const standardError = theoreticalSd / Math.sqrt(n);
    expect(Math.abs(mean(lr) - theoreticalMean)).toBeLessThan(4 * standardError);
    // The sample standard deviation's own standard error is ~sd/sqrt(2n).
    expect(Math.abs(standardDeviation(lr, 1) - theoreticalSd)).toBeLessThan(
      4 * (theoreticalSd / Math.sqrt(2 * n)),
    );
  });

  it("produces log returns with near-zero autocorrelation (independent increments)", () => {
    const path = generateGBM({ ...params, steps: 50000, horizonYears: 50000 / 252, seed: 17 });
    const lr = logReturns(path);
    for (const lag of [1, 2, 5, 10]) {
      expect(Math.abs(autocorrelation(lr, lag))).toBeLessThan(0.02);
    }
  });

  it("has a median below its mean (volatility drag)", () => {
    const { endingPrices } = simulateTerminalStats({ ...params, volatility: 0.6, seed: 31 }, 40000);
    const sorted = [...endingPrices].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    expect(med).toBeLessThan(mean(endingPrices));
  });

  it("generates independent paths", () => {
    const paths = generateGBMPaths(params, 2);
    expect(paths[0]).not.toEqual(paths[1]);
    const r0 = logReturns(paths[0]);
    const r1 = logReturns(paths[1]);
    expect(Math.abs(correlation(r0, r1))).toBeLessThan(0.15);
  });

  it("agrees between the path-based and streaming implementations", () => {
    const path = generateGBM(params);
    const streamed = simulateTerminalStats(params, 1);
    expect(streamed.endingPrices[0]).toBeCloseTo(path[path.length - 1], 9);
  });

  it("validates its inputs", () => {
    expect(() => generateGBM({ ...params, initialPrice: 0 })).toThrow();
    expect(() => generateGBM({ ...params, volatility: -0.1 })).toThrow();
    expect(() => generateGBM({ ...params, steps: 0 })).toThrow();
    expect(() => generateGBM({ ...params, horizonYears: 0 })).toThrow();
  });
});

describe("AR(1)", () => {
  const params = { drift: 0.05, volatility: 0.2, phi: 0, steps: 40000, seed: 4 };

  it("rejects a non-stationary phi", () => {
    expect(() => generateAR1({ ...params, phi: 1 })).toThrow();
    expect(() => generateAR1({ ...params, phi: -1.2 })).toThrow();
  });

  it("produces positive lag-1 autocorrelation for phi > 0", () => {
    const rets = generateAR1({ ...params, phi: 0.3 });
    expect(autocorrelation(rets, 1)).toBeGreaterThan(0.25);
    expect(autocorrelation(rets, 1)).toBeLessThan(0.35);
  });

  it("produces negative lag-1 autocorrelation for phi < 0", () => {
    const rets = generateAR1({ ...params, phi: -0.4 });
    expect(autocorrelation(rets, 1)).toBeLessThan(-0.35);
    expect(autocorrelation(rets, 1)).toBeGreaterThan(-0.45);
  });

  it("produces near-zero autocorrelation for phi = 0", () => {
    const rets = generateAR1({ ...params, phi: 0 });
    expect(Math.abs(autocorrelation(rets, 1))).toBeLessThan(0.02);
  });

  it("decays autocorrelation geometrically as phi^k", () => {
    const phi = 0.6;
    const rets = generateAR1({ ...params, phi, steps: 120000 });
    expect(autocorrelation(rets, 2)).toBeCloseTo(phi ** 2, 1);
    expect(autocorrelation(rets, 3)).toBeCloseTo(phi ** 3, 1);
  });

  it("holds realised volatility constant as phi changes", () => {
    // This is the rescaling guarantee: phi should change the MEMORY without
    // changing the overall spread, so comparisons isolate one effect.
    const volAt = (phi: number) =>
      standardDeviation(generateAR1({ ...params, phi, steps: 150000, seed: 21 }), 1) * Math.sqrt(252);
    expect(volAt(0)).toBeCloseTo(0.2, 2);
    expect(volAt(0.5)).toBeCloseTo(0.2, 2);
    expect(volAt(-0.5)).toBeCloseTo(0.2, 2);
  });
});

describe("Ornstein-Uhlenbeck", () => {
  it("reverts toward the long-run mean", () => {
    const path = generateOrnsteinUhlenbeck({
      initialValue: 50, longRunMean: 10, theta: 5, sigma: 1, steps: 2000, horizonYears: 4, seed: 6,
    });
    // Starting far from the mean, the tail of the series should be near it.
    const tail = path.slice(-200);
    expect(Math.abs(mean(tail) - 10)).toBeLessThan(2);
  });

  it("stays flat when theta and sigma are zero", () => {
    const path = generateOrnsteinUhlenbeck({
      initialValue: 5, longRunMean: 10, theta: 0, sigma: 0, steps: 50, horizonYears: 1, seed: 1,
    });
    for (const v of path) expect(v).toBeCloseTo(5, 10);
  });
});

describe("jump diffusion", () => {
  it("produces fatter tails than plain GBM at the same volatility", () => {
    const common = { initialPrice: 100, drift: 0.05, volatility: 0.15, steps: 60000, horizonYears: 60000 / 252, seed: 19 };
    const plain = logReturns(generateGBM(common));
    const jumpy = logReturns(generateJumpDiffusion({ ...common, jumpIntensity: 40, jumpMean: -0.02, jumpVolatility: 0.05 }));
    const excessKurtosis = (xs: number[]) => {
      const m = mean(xs);
      const sd = standardDeviation(xs, 1);
      return xs.reduce((acc, x) => acc + ((x - m) / sd) ** 4, 0) / xs.length - 3;
    };
    expect(excessKurtosis(jumpy)).toBeGreaterThan(excessKurtosis(plain));
  });

  it("stays positive", () => {
    const path = generateJumpDiffusion({
      initialPrice: 100, drift: 0, volatility: 0.3, steps: 5000, horizonYears: 20, seed: 3,
      jumpIntensity: 20, jumpMean: -0.1, jumpVolatility: 0.2,
    });
    for (const p of path) expect(p).toBeGreaterThan(0);
  });
});

describe("regime switching", () => {
  it("validates transition matrices", () => {
    expect(() => validateTransitionMatrix([[0.5, 0.5], [0.5, 0.5]], 2)).not.toThrow();
    expect(() => validateTransitionMatrix([[0.5, 0.6], [0.5, 0.5]], 2)).toThrow(/sum to 1/);
    expect(() => validateTransitionMatrix([[1]], 2)).toThrow();
    expect(() => validateTransitionMatrix([[1.5, -0.5], [0.5, 0.5]], 2)).toThrow();
  });

  it("normalises a row to sum to exactly 1", () => {
    const row = normaliseRow([2, 3, 5]);
    expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(row).toEqual([0.2, 0.3, 0.5]);
  });

  it("produces returns, prices and states of consistent length", () => {
    const r = generateRegimeMarket({ regimes: DEFAULT_REGIMES, transition: DEFAULT_TRANSITION, steps: 500, seed: 1 });
    expect(r.returns).toHaveLength(500);
    expect(r.regimes).toHaveLength(500);
    expect(r.prices).toHaveLength(501);
    expect(r.occupancy.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("is reproducible", () => {
    const a = generateRegimeMarket({ regimes: DEFAULT_REGIMES, transition: DEFAULT_TRANSITION, steps: 300, seed: 8 });
    const b = generateRegimeMarket({ regimes: DEFAULT_REGIMES, transition: DEFAULT_TRANSITION, steps: 300, seed: 8 });
    expect(a.prices).toEqual(b.prices);
    expect(a.regimes).toEqual(b.regimes);
  });

  it("never leaves an absorbing state", () => {
    const absorbing = [[1, 0, 0], [0.05, 0.95, 0], [0, 0.05, 0.95]];
    const r = generateRegimeMarket({
      regimes: DEFAULT_REGIMES, transition: absorbing, steps: 400, seed: 2, initialRegime: 0,
    });
    expect(r.regimes.every((s) => s === 0)).toBe(true);
  });

  it("matches observed occupancy to the stationary distribution over a long run", () => {
    const r = generateRegimeMarket({
      regimes: DEFAULT_REGIMES, transition: DEFAULT_TRANSITION, steps: 400000, seed: 55,
    });
    const pi = stationaryDistribution(DEFAULT_TRANSITION);
    for (let i = 0; i < pi.length; i++) {
      expect(Math.abs(r.occupancy[i] - pi[i])).toBeLessThan(0.03);
    }
  });

  it("gives a stationary distribution summing to 1", () => {
    const pi = stationaryDistribution(DEFAULT_TRANSITION);
    expect(pi.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    for (const p of pi) expect(p).toBeGreaterThanOrEqual(0);
  });

  it("produces higher realised volatility in the high-volatility regime", () => {
    const r = generateRegimeMarket({
      regimes: DEFAULT_REGIMES, transition: DEFAULT_TRANSITION, steps: 200000, seed: 91,
    });
    const bullRets = r.returns.filter((_, i) => r.regimes[i] === 0);
    const bearRets = r.returns.filter((_, i) => r.regimes[i] === 1);
    // Bear is configured with 34% vol vs Bull's 13%.
    expect(standardDeviation(bearRets, 1)).toBeGreaterThan(standardDeviation(bullRets, 1) * 1.8);
  });

  it("produces unconditionally fat-tailed returns from conditionally normal parts", () => {
    const r = generateRegimeMarket({
      regimes: DEFAULT_REGIMES, transition: DEFAULT_TRANSITION, steps: 200000, seed: 77,
    });
    const m = mean(r.returns);
    const sd = standardDeviation(r.returns, 1);
    const excess = r.returns.reduce((acc, x) => acc + ((x - m) / sd) ** 4, 0) / r.returns.length - 3;
    expect(excess).toBeGreaterThan(0.3);
  });
});

describe("risk process generators", () => {
  const base = { drift: 0.08, volatility: 0.2, steps: 100000, seed: 42, tailParam: 0.8 };

  it("produces the requested annual volatility for every process", () => {
    // Calibrating all four to the same volatility is what makes the risk-metric
    // comparison in the Risk Analyzer a controlled one. If the processes had
    // different scales, any difference in VaR would be confounded.
    for (const process of ["gbm", "regime", "jump", "studentt"] as const) {
      const { returns: rets } = generateRiskSeries(process, base);
      const realised = standardDeviation(rets, 1) * Math.sqrt(252);
      // All four are now calibrated to the same target, so the tolerance can be
      // tight: anything outside ±12% indicates a scaling bug, not sampling noise.
      expect(realised).toBeGreaterThan(0.2 * 0.88);
      expect(realised).toBeLessThan(0.2 * 1.12);
    }
  });

  it("gives the Gaussian process near-zero excess kurtosis", () => {
    const { returns: rets } = generateRiskSeries("gbm", base);
    expect(Math.abs(kurtosisOf(rets))).toBeLessThan(0.15);
  });

  it("gives every heavy-tailed process more excess kurtosis than the Gaussian one", () => {
    const gaussian = kurtosisOf(generateRiskSeries("gbm", base).returns);
    for (const process of ["regime", "jump", "studentt"] as const) {
      expect(kurtosisOf(generateRiskSeries(process, base).returns)).toBeGreaterThan(gaussian + 0.5);
    }
  });

  it("increases kurtosis as the tail parameter rises", () => {
    for (const process of ["regime", "jump", "studentt"] as const) {
      const mild = kurtosisOf(generateRiskSeries(process, { ...base, tailParam: 0.1 }).returns);
      const severe = kurtosisOf(generateRiskSeries(process, { ...base, tailParam: 1 }).returns);
      expect(severe).toBeGreaterThan(mild);
    }
  });

  it("keeps prices strictly positive", () => {
    for (const process of ["gbm", "regime", "jump", "studentt"] as const) {
      const { prices } = generateRiskSeries(process, { ...base, steps: 5000 });
      for (const p of prices) expect(p).toBeGreaterThan(0);
    }
  });

  it("is reproducible for a fixed seed", () => {
    const a = generateRiskSeries("jump", { ...base, steps: 500 });
    const b = generateRiskSeries("jump", { ...base, steps: 500 });
    expect(a.returns).toEqual(b.returns);
  });

  it("returns one fewer return than prices", () => {
    const { returns: rets, prices } = generateRiskSeries("gbm", { ...base, steps: 300 });
    expect(rets).toHaveLength(300);
    expect(prices).toHaveLength(301);
  });
});

function kurtosisOf(xs: number[]): number {
  const m = mean(xs);
  const sd = standardDeviation(xs, 1);
  return xs.reduce((acc, x) => acc + ((x - m) / sd) ** 4, 0) / xs.length - 3;
}
