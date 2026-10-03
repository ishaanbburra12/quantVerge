import { describe, it, expect } from "vitest";
import {
  simulateGarch, garchLogLikelihood, fitGarch, garchFilter, forecastVariance,
  longRunVariance, volatilityHalfLife, type GarchParams,
} from "@/lib/finance/garch";
import { nelderMead } from "@/lib/math/optimize";
import { autocorrelation, standardDeviation, kurtosis, mean } from "@/lib/statistics/descriptive";

const typical: GarchParams = { omega: 0.000002, alpha: 0.08, beta: 0.90, mu: 0.0003 };

describe("Nelder-Mead", () => {
  it("minimises a quadratic bowl", () => {
    const r = nelderMead((x) => (x[0] - 3) ** 2 + (x[1] + 1) ** 2, [0, 0]);
    expect(r.x[0]).toBeCloseTo(3, 4);
    expect(r.x[1]).toBeCloseTo(-1, 4);
    expect(r.converged).toBe(true);
  });

  it("solves the Rosenbrock function, which is deliberately hard", () => {
    // A curved narrow valley — the standard stress test for optimisers.
    const rosenbrock = (x: number[]) => (1 - x[0]) ** 2 + 100 * (x[1] - x[0] ** 2) ** 2;
    const r = nelderMead(rosenbrock, [-1.2, 1], { maxIterations: 5000, tolerance: 1e-14 });
    expect(r.x[0]).toBeCloseTo(1, 2);
    expect(r.x[1]).toBeCloseTo(1, 2);
  });

  it("works in one dimension", () => {
    const r = nelderMead((x) => Math.abs(x[0] - 7) ** 1.5, [0]);
    expect(r.x[0]).toBeCloseTo(7, 3);
  });

  it("does not stop while the simplex still straddles the minimum", () => {
    // Regression test. A simplex symmetric about the minimum has IDENTICAL
    // objective values at every vertex, so a convergence test based only on the
    // spread of function values sees zero spread and declares success while the
    // vertices are still far apart. This case previously returned 6.9 with
    // converged === true — a confidently wrong answer.
    const r = nelderMead((x) => (x[0] - 7) ** 2, [0]);
    expect(r.converged).toBe(true);
    expect(Math.abs(r.x[0] - 7)).toBeLessThan(1e-4);
  });

  it("converges on parameters of very different magnitudes", () => {
    // GARCH mixes omega around 1e-6 with beta around 0.9, so the domain
    // criterion has to be scale-relative rather than absolute.
    const r = nelderMead(
      (x) => (x[0] - 0.000002) ** 2 * 1e12 + (x[1] - 0.9) ** 2,
      [0.000001, 0.5],
      { scale: [0.000001, 0.2] },
    );
    expect(r.x[0]).toBeCloseTo(0.000002, 7);
    expect(r.x[1]).toBeCloseTo(0.9, 4);
  });
});

describe("GARCH structure", () => {
  it("computes the long-run variance", () => {
    // omega / (1 - alpha - beta) = 0.000002 / 0.02 = 0.0001
    expect(longRunVariance(typical)).toBeCloseTo(0.0001, 12);
  });

  it("returns infinite long-run variance for a non-stationary process", () => {
    expect(longRunVariance({ ...typical, alpha: 0.1, beta: 0.9 })).toBe(Infinity);
    expect(longRunVariance({ ...typical, alpha: 0.5, beta: 0.6 })).toBe(Infinity);
  });

  it("computes the shock half-life from persistence", () => {
    // persistence 0.98 -> ln(0.5)/ln(0.98) = 34.3 periods
    expect(volatilityHalfLife(typical)).toBeCloseTo(34.31, 1);
    // Higher persistence means shocks last longer.
    expect(volatilityHalfLife({ ...typical, beta: 0.95 })).toBeGreaterThan(volatilityHalfLife(typical));
  });
});

describe("GARCH simulation", () => {
  it("produces series of consistent length", () => {
    const s = simulateGarch(typical, 500, 42);
    expect(s.returns).toHaveLength(500);
    expect(s.variances).toHaveLength(500);
    expect(s.prices).toHaveLength(501);
  });

  it("is reproducible for a fixed seed", () => {
    expect(simulateGarch(typical, 200, 7).returns).toEqual(simulateGarch(typical, 200, 7).returns);
  });

  it("keeps every conditional variance positive", () => {
    for (const v of simulateGarch(typical, 5000, 3).variances) expect(v).toBeGreaterThan(0);
  });

  it("realises a volatility close to the long-run level", () => {
    const s = simulateGarch(typical, 200000, 11);
    const realised = standardDeviation(s.returns, 1);
    const theoretical = Math.sqrt(longRunVariance(typical));
    expect(realised / theoretical).toBeGreaterThan(0.85);
    expect(realised / theoretical).toBeLessThan(1.15);
  });

  it("produces volatility clustering — the whole point", () => {
    // Squared returns must be autocorrelated, even though returns are not.
    const s = simulateGarch(typical, 50000, 19);
    const squared = s.returns.map((r) => (r - typical.mu) ** 2);
    expect(autocorrelation(squared, 1)).toBeGreaterThan(0.1);
    expect(autocorrelation(squared, 5)).toBeGreaterThan(0.05);
    // Returns themselves should show essentially none.
    expect(Math.abs(autocorrelation(s.returns, 1))).toBeLessThan(0.03);
  });

  it("produces fat tails without any fat-tailed input", () => {
    // Shocks are Gaussian; the mixture over time-varying variance is not.
    const s = simulateGarch(typical, 60000, 23);
    expect(kurtosis(s.returns)).toBeGreaterThan(0.5);
  });

  it("produces almost no clustering when alpha and beta are near zero", () => {
    const flat: GarchParams = { omega: 0.0001, alpha: 0.001, beta: 0.001, mu: 0 };
    const s = simulateGarch(flat, 40000, 31);
    const squared = s.returns.map((r) => r * r);
    expect(Math.abs(autocorrelation(squared, 1))).toBeLessThan(0.03);
    expect(Math.abs(kurtosis(s.returns))).toBeLessThan(0.2);
  });

  it("clusters more as persistence rises", () => {
    const low = simulateGarch({ omega: 0.00005, alpha: 0.03, beta: 0.4, mu: 0 }, 40000, 5);
    const high = simulateGarch({ omega: 0.000002, alpha: 0.09, beta: 0.90, mu: 0 }, 40000, 5);
    const acf = (s: typeof low) => autocorrelation(s.returns.map((r) => r * r), 1);
    expect(acf(high)).toBeGreaterThan(acf(low));
  });

  it("validates its inputs", () => {
    expect(() => simulateGarch({ ...typical, omega: 0 }, 100, 1)).toThrow();
    expect(() => simulateGarch({ ...typical, alpha: -0.1 }, 100, 1)).toThrow();
    expect(() => simulateGarch(typical, 0, 1)).toThrow();
  });
});

describe("GARCH likelihood", () => {
  it("rejects inadmissible parameters", () => {
    const r = simulateGarch(typical, 500, 1).returns;
    expect(garchLogLikelihood(r, { ...typical, omega: -1 })).toBe(-Infinity);
    expect(garchLogLikelihood(r, { ...typical, alpha: 0.5, beta: 0.6 })).toBe(-Infinity);
  });

  it("is maximised near the true parameters", () => {
    // The defining property of maximum likelihood: the truth should score
    // better than a clearly wrong alternative.
    const r = simulateGarch(typical, 8000, 77).returns;
    const atTruth = garchLogLikelihood(r, typical);
    const wrong = garchLogLikelihood(r, { ...typical, alpha: 0.4, beta: 0.4 });
    expect(atTruth).toBeGreaterThan(wrong);
  });

  it("is finite for reasonable parameters", () => {
    const r = simulateGarch(typical, 1000, 2).returns;
    expect(Number.isFinite(garchLogLikelihood(r, typical))).toBe(true);
  });
});

describe("GARCH estimation", () => {
  it("recovers the persistence of a simulated process", () => {
    // The headline test: generate data from known parameters, fit, and check the
    // fit finds them. Persistence is the most reliably estimated quantity;
    // alpha and beta individually are less well identified.
    const r = simulateGarch(typical, 12000, 2024).returns;
    const fit = fitGarch(r);
    expect(fit.persistence).toBeGreaterThan(0.93);
    expect(fit.persistence).toBeLessThan(0.999);
  });

  it("recovers the long-run volatility", () => {
    const r = simulateGarch(typical, 12000, 2025).returns;
    const fit = fitGarch(r);
    const trueVol = Math.sqrt(longRunVariance(typical) * 252);
    expect(fit.longRunVolatility / trueVol).toBeGreaterThan(0.7);
    expect(fit.longRunVolatility / trueVol).toBeLessThan(1.4);
  });

  it("gives a fitted likelihood at least as good as the true parameters", () => {
    // The MLE maximises likelihood ON THIS SAMPLE, so it should match or beat
    // the true parameters — which is itself a reminder that a better in-sample
    // fit does not mean better parameters.
    const r = simulateGarch(typical, 6000, 99).returns;
    const fit = fitGarch(r);
    expect(fit.logLikelihood).toBeGreaterThanOrEqual(garchLogLikelihood(r, typical) - 1e-6);
  });

  it("returns admissible parameters", () => {
    const r = simulateGarch(typical, 4000, 55).returns;
    const fit = fitGarch(r);
    expect(fit.params.omega).toBeGreaterThan(0);
    expect(fit.params.alpha).toBeGreaterThanOrEqual(0);
    expect(fit.params.beta).toBeGreaterThanOrEqual(0);
    expect(fit.persistence).toBeLessThan(1);
  });

  it("computes information criteria", () => {
    const r = simulateGarch(typical, 2000, 8).returns;
    const fit = fitGarch(r);
    expect(fit.aic).toBeLessThan(0);
    expect(fit.bic).toBeGreaterThan(fit.aic); // BIC penalises parameters harder
  });

  it("rejects a sample that is too small", () => {
    expect(() => fitGarch([0.01, -0.02, 0.01])).toThrow();
  });
});

describe("GARCH filtering and forecasting", () => {
  it("filters to a volatility path of the right length", () => {
    const s = simulateGarch(typical, 1000, 4);
    expect(garchFilter(s.returns, typical)).toHaveLength(1000);
  });

  it("recovers a volatility path correlated with the true one", () => {
    const s = simulateGarch(typical, 5000, 6);
    const filtered = garchFilter(s.returns, typical);
    const trueVol = s.volatilities;
    // Not identical — the filter seeds differently — but strongly related.
    const n = filtered.length;
    let num = 0, d1 = 0, d2 = 0;
    const m1 = mean(filtered), m2 = mean(trueVol);
    for (let i = 100; i < n; i++) {
      num += (filtered[i] - m1) * (trueVol[i] - m2);
      d1 += (filtered[i] - m1) ** 2;
      d2 += (trueVol[i] - m2) ** 2;
    }
    expect(num / Math.sqrt(d1 * d2)).toBeGreaterThan(0.95);
  });

  it("decays the forecast toward the long-run variance", () => {
    const longRun = longRunVariance(typical);
    const elevated = longRun * 4;
    const f = forecastVariance(typical, elevated, 500);
    expect(f[0].variance).toBeCloseTo(elevated, 10);
    expect(f[499].variance).toBeLessThan(f[0].variance);
    expect(f[499].variance / longRun).toBeGreaterThan(0.95);
    expect(f[499].variance / longRun).toBeLessThan(1.05);
  });

  it("forecasts upward from a depressed level", () => {
    const longRun = longRunVariance(typical);
    const f = forecastVariance(typical, longRun / 4, 300);
    expect(f[299].variance).toBeGreaterThan(f[0].variance);
  });

  it("decays faster when persistence is lower", () => {
    const longRun = longRunVariance(typical);
    const slow = forecastVariance(typical, longRun * 3, 30);
    const fast = forecastVariance({ omega: 0.00005, alpha: 0.05, beta: 0.45, mu: 0 }, longRunVariance({ omega: 0.00005, alpha: 0.05, beta: 0.45, mu: 0 }) * 3, 30);
    const slowGap = (slow[29].variance - longRun) / (slow[0].variance - longRun);
    const fastLongRun = longRunVariance({ omega: 0.00005, alpha: 0.05, beta: 0.45, mu: 0 });
    const fastGap = (fast[29].variance - fastLongRun) / (fast[0].variance - fastLongRun);
    expect(fastGap).toBeLessThan(slowGap);
  });
});
