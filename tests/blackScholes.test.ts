import { describe, it, expect } from "vitest";
import {
  blackScholes, blackScholesCall, blackScholesPut, putCallParityResidual,
  monteCarloOptionPrice, impliedVolatility,
} from "@/lib/finance/blackScholes";
import { normalCDF, normalPDF, normalInverseCDF } from "@/lib/math/distributions";

const base = { spot: 100, strike: 100, timeToExpiry: 1, riskFreeRate: 0.05, volatility: 0.2 };

describe("normal distribution functions", () => {
  it("has CDF(0) = 0.5", () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 10);
  });

  it("matches published standard normal CDF values", () => {
    expect(normalCDF(1)).toBeCloseTo(0.8413447461, 7);
    expect(normalCDF(-1)).toBeCloseTo(0.1586552539, 7);
    expect(normalCDF(1.96)).toBeCloseTo(0.9750021049, 7);
    expect(normalCDF(2.5758293035)).toBeCloseTo(0.995, 6);
  });

  it("is symmetric: CDF(-x) = 1 - CDF(x)", () => {
    for (const x of [0.3, 1.1, 2.4, 3.7]) {
      expect(normalCDF(-x)).toBeCloseTo(1 - normalCDF(x), 9);
    }
  });

  it("has PDF peak 1/sqrt(2*pi) at zero", () => {
    expect(normalPDF(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 12);
  });

  it("inverts the CDF", () => {
    for (const p of [0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99]) {
      expect(normalCDF(normalInverseCDF(p))).toBeCloseTo(p, 8);
    }
  });

  it("matches the standard VaR quantiles", () => {
    expect(normalInverseCDF(0.05)).toBeCloseTo(-1.6448536270, 7);
    expect(normalInverseCDF(0.01)).toBeCloseTo(-2.3263478740, 7);
    expect(normalInverseCDF(0.1)).toBeCloseTo(-1.2815515655, 7);
  });

  it("rejects probabilities outside (0, 1)", () => {
    expect(() => normalInverseCDF(0)).toThrow();
    expect(() => normalInverseCDF(1)).toThrow();
  });
});

describe("Black-Scholes against known textbook values", () => {
  // The canonical worked example: S=100, K=100, T=1, r=5%, sigma=20%.
  // Call = 10.450584, Put = 5.573526. These are quoted to 6dp in standard
  // references and reproducible in any correct implementation.
  it("prices the canonical at-the-money call", () => {
    expect(blackScholesCall(base)).toBeCloseTo(10.450583572, 6);
  });

  it("prices the canonical at-the-money put", () => {
    expect(blackScholesPut(base)).toBeCloseTo(5.573526022, 6);
  });

  it("computes d1 and d2 correctly for that example", () => {
    const { d1, d2 } = blackScholes(base, "call");
    // d1 = (0 + (0.05 + 0.02)) / 0.2 = 0.35; d2 = 0.35 - 0.2 = 0.15
    expect(d1).toBeCloseTo(0.35, 10);
    expect(d2).toBeCloseTo(0.15, 10);
  });

  it("prices a second known case (S=42, K=40, T=0.5, r=10%, sigma=20%) ~ 4.76", () => {
    // Hull's worked example; call = 4.759422.
    const price = blackScholesCall({ spot: 42, strike: 40, timeToExpiry: 0.5, riskFreeRate: 0.1, volatility: 0.2 });
    expect(price).toBeCloseTo(4.759422, 5);
  });
});

describe("put-call parity", () => {
  it("holds across a range of parameters", () => {
    const cases = [
      base,
      { spot: 80, strike: 100, timeToExpiry: 0.5, riskFreeRate: 0.03, volatility: 0.35 },
      { spot: 150, strike: 100, timeToExpiry: 2, riskFreeRate: 0.07, volatility: 0.15 },
      { spot: 100, strike: 100, timeToExpiry: 0.08, riskFreeRate: 0.01, volatility: 0.6 },
      { spot: 100, strike: 90, timeToExpiry: 1, riskFreeRate: 0.05, volatility: 0.2, dividendYield: 0.03 },
    ];
    for (const c of cases) {
      expect(Math.abs(putCallParityResidual(c))).toBeLessThan(1e-8);
    }
  });
});

describe("option price bounds and monotonicity", () => {
  it("never prices an option below zero", () => {
    const deepOtm = blackScholesCall({ ...base, strike: 10000 });
    expect(deepOtm).toBeGreaterThanOrEqual(0);
  });

  it("never prices a call above the spot price", () => {
    expect(blackScholesCall({ ...base, strike: 0.01 })).toBeLessThanOrEqual(base.spot + 1e-9);
  });

  it("is at least the intrinsic value for a call", () => {
    const r = blackScholes({ ...base, spot: 130 }, "call");
    expect(r.price).toBeGreaterThanOrEqual(r.intrinsicValue - 1e-9);
  });

  it("increases monotonically with volatility", () => {
    let previous = -1;
    for (const vol of [0.05, 0.1, 0.2, 0.4, 0.8]) {
      const p = blackScholesCall({ ...base, volatility: vol });
      expect(p).toBeGreaterThan(previous);
      previous = p;
    }
  });

  it("increases monotonically with spot for a call and decreases for a put", () => {
    let prevCall = -1;
    let prevPut = Infinity;
    for (const s of [60, 80, 100, 120, 140]) {
      const c = blackScholesCall({ ...base, spot: s });
      const p = blackScholesPut({ ...base, spot: s });
      expect(c).toBeGreaterThan(prevCall);
      expect(p).toBeLessThan(prevPut);
      prevCall = c;
      prevPut = p;
    }
  });

  it("collapses to discounted intrinsic value at zero volatility", () => {
    const c = blackScholesCall({ ...base, volatility: 0, spot: 120 });
    const expected = 120 - 100 * Math.exp(-0.05);
    expect(c).toBeCloseTo(expected, 8);
  });

  it("equals intrinsic value at expiry", () => {
    expect(blackScholesCall({ ...base, timeToExpiry: 0, spot: 115 })).toBeCloseTo(15, 8);
    expect(blackScholesCall({ ...base, timeToExpiry: 0, spot: 85 })).toBeCloseTo(0, 8);
    expect(blackScholesPut({ ...base, timeToExpiry: 0, spot: 85 })).toBeCloseTo(15, 8);
  });

  it("rejects invalid inputs", () => {
    expect(() => blackScholesCall({ ...base, spot: 0 })).toThrow();
    expect(() => blackScholesCall({ ...base, strike: -5 })).toThrow();
    expect(() => blackScholesCall({ ...base, volatility: -0.1 })).toThrow();
    expect(() => blackScholesCall({ ...base, timeToExpiry: -1 })).toThrow();
  });
});

describe("Greeks", () => {
  it("gives the canonical example's delta as N(d1)", () => {
    const { greeks } = blackScholes(base, "call");
    expect(greeks.delta).toBeCloseTo(normalCDF(0.35), 9);
    expect(greeks.delta).toBeCloseTo(0.6368306512, 7);
  });

  it("keeps call delta in [0,1] and put delta in [-1,0]", () => {
    for (const s of [50, 80, 100, 130, 200]) {
      const c = blackScholes({ ...base, spot: s }, "call").greeks.delta;
      const p = blackScholes({ ...base, spot: s }, "put").greeks.delta;
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
      expect(p).toBeLessThanOrEqual(0);
      expect(p).toBeGreaterThanOrEqual(-1);
    }
  });

  it("satisfies the parity relation delta_call - delta_put = e^(-qT)", () => {
    const c = blackScholes(base, "call").greeks.delta;
    const p = blackScholes(base, "put").greeks.delta;
    expect(c - p).toBeCloseTo(1, 9);
  });

  it("gives identical gamma and vega for calls and puts", () => {
    const c = blackScholes(base, "call").greeks;
    const p = blackScholes(base, "put").greeks;
    expect(c.gamma).toBeCloseTo(p.gamma, 12);
    expect(c.vega).toBeCloseTo(p.vega, 12);
  });

  it("keeps gamma non-negative", () => {
    for (const s of [50, 90, 100, 110, 180]) {
      expect(blackScholes({ ...base, spot: s }, "call").greeks.gamma).toBeGreaterThanOrEqual(0);
    }
  });

  it("matches a finite-difference delta", () => {
    const h = 1e-5;
    const up = blackScholesCall({ ...base, spot: base.spot + h });
    const down = blackScholesCall({ ...base, spot: base.spot - h });
    const numerical = (up - down) / (2 * h);
    expect(blackScholes(base, "call").greeks.delta).toBeCloseTo(numerical, 6);
  });

  it("matches a finite-difference gamma", () => {
    const h = 1e-3;
    const up = blackScholesCall({ ...base, spot: base.spot + h });
    const mid = blackScholesCall(base);
    const down = blackScholesCall({ ...base, spot: base.spot - h });
    const numerical = (up - 2 * mid + down) / (h * h);
    expect(blackScholes(base, "call").greeks.gamma).toBeCloseTo(numerical, 5);
  });

  it("matches a finite-difference vega (scaled per percentage point)", () => {
    const h = 1e-6;
    const up = blackScholesCall({ ...base, volatility: base.volatility + h });
    const down = blackScholesCall({ ...base, volatility: base.volatility - h });
    const numerical = (up - down) / (2 * h) / 100;
    expect(blackScholes(base, "call").greeks.vega).toBeCloseTo(numerical, 6);
  });

  it("matches a finite-difference theta (scaled per day)", () => {
    const h = 1e-6;
    // Theta is the derivative with respect to calendar time, so T decreases.
    const later = blackScholesCall({ ...base, timeToExpiry: base.timeToExpiry - h });
    const earlier = blackScholesCall({ ...base, timeToExpiry: base.timeToExpiry + h });
    const numerical = ((later - earlier) / (2 * h)) / 365;
    expect(blackScholes(base, "call").greeks.theta).toBeCloseTo(numerical, 6);
  });

  it("gives negative theta for a long at-the-money call", () => {
    expect(blackScholes(base, "call").greeks.theta).toBeLessThan(0);
  });
});

describe("Monte Carlo option pricing", () => {
  it("converges to the Black-Scholes price", () => {
    const mc = monteCarloOptionPrice(base, "call", 200000, 42);
    const analytic = blackScholesCall(base);
    // Within 4 standard errors is a very safe band for a correct estimator.
    expect(Math.abs(mc.price - analytic)).toBeLessThan(4 * mc.standardError + 1e-9);
    expect(Math.abs(mc.price - analytic)).toBeLessThan(0.05);
  });

  it("brackets the analytic price in its confidence interval", () => {
    const mc = monteCarloOptionPrice(base, "call", 100000, 7);
    const analytic = blackScholesCall(base);
    expect(analytic).toBeGreaterThan(mc.confidenceInterval[0]);
    expect(analytic).toBeLessThan(mc.confidenceInterval[1]);
  });

  it("prices puts correctly too", () => {
    const mc = monteCarloOptionPrice(base, "put", 200000, 11);
    expect(Math.abs(mc.price - blackScholesPut(base))).toBeLessThan(0.05);
  });

  it("shrinks the standard error roughly as 1/sqrt(n)", () => {
    const small = monteCarloOptionPrice(base, "call", 2500, 3, false);
    const large = monteCarloOptionPrice(base, "call", 250000, 3, false);
    const ratio = small.standardError / large.standardError;
    // 100x the samples should cut the error ~10x.
    expect(ratio).toBeGreaterThan(6);
    expect(ratio).toBeLessThan(16);
  });

  it("is reduced in variance by antithetic sampling", () => {
    const plain = monteCarloOptionPrice(base, "call", 20000, 99, false);
    const anti = monteCarloOptionPrice(base, "call", 20000, 99, true);
    expect(anti.standardError).toBeLessThan(plain.standardError);
  });

  it("is reproducible for a fixed seed", () => {
    const a = monteCarloOptionPrice(base, "call", 5000, 2024);
    const b = monteCarloOptionPrice(base, "call", 5000, 2024);
    expect(a.price).toBe(b.price);
  });

  it("differs for different seeds", () => {
    const a = monteCarloOptionPrice(base, "call", 5000, 1);
    const b = monteCarloOptionPrice(base, "call", 5000, 2);
    expect(a.price).not.toBe(b.price);
  });

  it("rejects too few simulations", () => {
    expect(() => monteCarloOptionPrice(base, "call", 1, 1)).toThrow();
  });
});

describe("implied volatility", () => {
  it("recovers the volatility used to generate a price", () => {
    const price = blackScholesCall({ ...base, volatility: 0.33 });
    const { volatility: _omit, ...rest } = { ...base, volatility: 0.33 };
    const iv = impliedVolatility(price, rest, "call");
    expect(iv).not.toBeNull();
    expect(iv!).toBeCloseTo(0.33, 6);
  });

  it("returns null for an unreachable price", () => {
    const { volatility: _omit, ...rest } = base;
    expect(impliedVolatility(1e6, rest, "call")).toBeNull();
  });
});
