import { describe, it, expect } from "vitest";
import {
  returns, logReturns, pricesFromReturns, cumulativeReturn, annualisedReturn,
  annualisedVolatility, sharpeRatio, sortinoRatio, downsideDeviation, maxDrawdown,
  valueAtRisk, conditionalVaR, parametricVaR, hitRate, profitFactor, beta, calmarRatio,
} from "@/lib/finance/performance";
import { normalInverseCDF } from "@/lib/math/distributions";
import { seededNormal, mulberry32 } from "@/lib/math/random";

describe("return calculations", () => {
  it("produces n-1 returns from n prices", () => {
    expect(returns([100, 110, 121])).toHaveLength(2);
    expect(logReturns([100, 110, 121])).toHaveLength(2);
  });

  it("computes simple returns correctly", () => {
    expect(returns([100, 110])[0]).toBeCloseTo(0.1, 12);
    expect(returns([100, 90])[0]).toBeCloseTo(-0.1, 12);
  });

  it("computes log returns correctly", () => {
    expect(logReturns([100, 200])[0]).toBeCloseTo(Math.LN2, 12);
  });

  it("makes log returns additive over time", () => {
    const prices = [100, 117, 98, 143, 131];
    const lr = logReturns(prices);
    const total = lr.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(Math.log(131 / 100), 12);
  });

  it("agrees with simple returns for small moves", () => {
    const simple = returns([100, 100.1])[0];
    const log = logReturns([100, 100.1])[0];
    expect(Math.abs(simple - log)).toBeLessThan(1e-5);
  });

  it("round-trips through pricesFromReturns", () => {
    const original = [100, 103, 99, 107, 112];
    const rebuilt = pricesFromReturns(returns(original), 100);
    for (let i = 0; i < original.length; i++) expect(rebuilt[i]).toBeCloseTo(original[i], 9);
  });

  it("rejects non-positive prices for log returns", () => {
    expect(() => logReturns([100, 0])).toThrow();
    expect(() => logReturns([100, -5])).toThrow();
  });

  it("rejects a zero price for simple returns", () => {
    expect(() => returns([0, 100])).toThrow();
  });
});

describe("cumulative and annualised returns", () => {
  it("compounds rather than adds", () => {
    // +50% then -50% leaves you at 0.75, not at 1.0.
    expect(cumulativeReturn([0.5, -0.5])).toBeCloseTo(-0.25, 12);
  });

  it("computes CAGR correctly for a clean doubling over 2 years", () => {
    // Two annual periods, total growth 2x. CAGR = 2^(1/2) - 1 = 41.42%
    const annual = annualisedReturn([1.0, 0.0], 1);
    expect(annual).toBeCloseTo(Math.SQRT2 - 1, 10);
  });

  it("returns -100% for a total wipeout", () => {
    expect(annualisedReturn([-1, 0.5], 252)).toBe(-1);
  });

  it("gives a geometric mean below the arithmetic mean when returns vary", () => {
    // Jensen's inequality / volatility drag.
    const rets = [0.2, -0.1, 0.15, -0.05, 0.1];
    const arithmetic = rets.reduce((a, b) => a + b, 0) / rets.length;
    const geometric = annualisedReturn(rets, 1);
    expect(geometric).toBeLessThan(arithmetic);
  });

  it("gives identical arithmetic and geometric means for constant returns", () => {
    expect(annualisedReturn([0.1, 0.1, 0.1], 1)).toBeCloseTo(0.1, 10);
  });

  it("handles an empty series without NaN", () => {
    expect(annualisedReturn([], 252)).toBe(0);
    expect(annualisedVolatility([], 252)).toBe(0);
    expect(sharpeRatio([], 0, 252)).toBe(0);
  });
});

describe("volatility and risk-adjusted ratios", () => {
  it("annualises by sqrt(periodsPerYear)", () => {
    const rets = [0.01, -0.005, 0.012, -0.008, 0.003, 0.007];
    const daily = annualisedVolatility(rets, 1);
    expect(annualisedVolatility(rets, 252)).toBeCloseTo(daily * Math.sqrt(252), 10);
  });

  it("gives Sharpe 0 for a constant return series", () => {
    expect(sharpeRatio([0.001, 0.001, 0.001], 0, 252)).toBe(0);
  });

  it("gives a positive Sharpe for a profitable, low-volatility series", () => {
    const rets = Array.from({ length: 252 }, (_, i) => 0.0005 + (i % 2 === 0 ? 0.0001 : -0.0001));
    expect(sharpeRatio(rets, 0, 252)).toBeGreaterThan(0);
  });

  it("reproduces a hand-computable Sharpe", () => {
    // Annual data, mean 10%, sd 20%, rf 2% -> Sharpe = 0.4
    const rets = [0.3, -0.1];
    // mean = 0.1; sample sd = sqrt(((0.2)^2 + (0.2)^2)/1) = 0.28284
    const s = sharpeRatio(rets, 0, 1);
    expect(s).toBeCloseTo(0.1 / 0.28284271, 5);
  });

  it("lowers Sharpe when the risk-free rate rises", () => {
    const rets = Array.from({ length: 100 }, (_, i) => 0.001 * ((i % 3) - 0.5));
    expect(sharpeRatio(rets, 0.05, 252)).toBeLessThan(sharpeRatio(rets, 0, 252));
  });

  it("gives downside deviation of zero when nothing is below target", () => {
    expect(downsideDeviation([0.01, 0.02, 0.03], 0, 252)).toBe(0);
  });

  it("gives downside deviation below total volatility for upside-skewed returns", () => {
    const rets = [0.3, 0.25, 0.2, -0.01, -0.02, 0.4];
    expect(downsideDeviation(rets, 0, 1)).toBeLessThan(annualisedVolatility(rets, 1));
  });

  it("gives Sortino above Sharpe when losses are small but gains are volatile", () => {
    const rets = [0.3, -0.01, 0.25, -0.01, 0.4, -0.02, 0.35, -0.01];
    expect(sortinoRatio(rets, 0, 1)).toBeGreaterThan(sharpeRatio(rets, 0, 1));
  });

  it("divides downside deviation by the full count, not the loss count", () => {
    // Two series with the same single loss but different lengths must differ.
    const few = [-0.1, 0.01];
    const many = [-0.1, 0.01, 0.01, 0.01, 0.01, 0.01];
    expect(downsideDeviation(few, 0, 1)).toBeGreaterThan(downsideDeviation(many, 0, 1));
  });
});

describe("maximum drawdown", () => {
  it("identifies a known peak and trough", () => {
    // Peak 120 at index 2, trough 60 at index 4 -> 50% drawdown.
    const equity = [100, 110, 120, 90, 60, 80, 130];
    const dd = maxDrawdown(equity);
    expect(dd.maxDrawdown).toBeCloseTo(0.5, 10);
    expect(dd.peakIndex).toBe(2);
    expect(dd.troughIndex).toBe(4);
  });

  it("finds the recovery point", () => {
    const equity = [100, 110, 120, 90, 60, 80, 130];
    expect(maxDrawdown(equity).recoveryIndex).toBe(6);
  });

  it("reports no recovery when the series never regains its peak", () => {
    const equity = [100, 150, 80, 90, 95];
    expect(maxDrawdown(equity).recoveryIndex).toBeNull();
  });

  it("reports the peak in force at the time, not the global maximum", () => {
    // The worst drawdown (50%, from 100 to 50) happens BEFORE the all-time high
    // of 300. A naive implementation would report index 4 as the peak.
    const equity = [100, 50, 120, 200, 300, 280];
    const dd = maxDrawdown(equity);
    expect(dd.maxDrawdown).toBeCloseTo(0.5, 10);
    expect(dd.peakIndex).toBe(0);
    expect(dd.troughIndex).toBe(1);
  });

  it("is zero for a monotonically rising series", () => {
    expect(maxDrawdown([1, 2, 3, 4, 5]).maxDrawdown).toBe(0);
  });

  it("is a positive fraction between 0 and 1", () => {
    const dd = maxDrawdown([100, 30, 60, 10, 90]);
    expect(dd.maxDrawdown).toBeGreaterThan(0);
    expect(dd.maxDrawdown).toBeLessThanOrEqual(1);
  });

  it("handles an empty and a single-element series", () => {
    expect(maxDrawdown([]).maxDrawdown).toBe(0);
    expect(maxDrawdown([100]).maxDrawdown).toBe(0);
  });

  it("is path-dependent: reordering the same returns changes it", () => {
    const a = maxDrawdown(pricesFromReturns([0.1, -0.2, 0.1, -0.2], 100)).maxDrawdown;
    const b = maxDrawdown(pricesFromReturns([-0.2, -0.2, 0.1, 0.1], 100)).maxDrawdown;
    expect(a).not.toBeCloseTo(b, 6);
  });

  it("produces a drawdown series of matching length, all non-positive", () => {
    const dd = maxDrawdown([100, 90, 95, 80]);
    expect(dd.series).toHaveLength(4);
    for (const v of dd.series) expect(v).toBeLessThanOrEqual(0);
  });

  it("tracks the longest underwater stretch", () => {
    const dd = maxDrawdown([100, 90, 85, 80, 110, 100]);
    expect(dd.longestDrawdownLength).toBe(3);
  });
});

describe("Value at Risk", () => {
  const rets = Array.from({ length: 1000 }, (_, i) => Math.sin(i * 1.7) * 0.02 + 0.0002);

  it("is non-negative", () => {
    expect(valueAtRisk(rets, 0.95)).toBeGreaterThanOrEqual(0);
  });

  it("increases with the confidence level", () => {
    const v90 = valueAtRisk(rets, 0.9);
    const v95 = valueAtRisk(rets, 0.95);
    const v99 = valueAtRisk(rets, 0.99);
    expect(v95).toBeGreaterThanOrEqual(v90);
    expect(v99).toBeGreaterThanOrEqual(v95);
  });

  it("matches a hand-computed percentile", () => {
    // 100 values from -0.50 to +0.49 in steps of 0.01. The 5th percentile of
    // this set is -0.4505 by linear interpolation, so VaR = 0.4505.
    const simple = Array.from({ length: 100 }, (_, i) => (i - 50) / 100);
    expect(valueAtRisk(simple, 0.95)).toBeCloseTo(0.4505, 10);
  });

  it("rejects an invalid confidence level", () => {
    expect(() => valueAtRisk(rets, 0)).toThrow();
    expect(() => valueAtRisk(rets, 1)).toThrow();
  });

  it("is zero when even the tail is profitable", () => {
    expect(valueAtRisk([0.01, 0.02, 0.03, 0.04], 0.95)).toBe(0);
  });
});

describe("Conditional VaR", () => {
  it("is always at least as large as VaR", () => {
    const rets = Array.from({ length: 2000 }, (_, i) => Math.cos(i * 0.9) * 0.03);
    for (const c of [0.9, 0.95, 0.99]) {
      expect(conditionalVaR(rets, c)).toBeGreaterThanOrEqual(valueAtRisk(rets, c) - 1e-12);
    }
  });

  it("distinguishes two series with identical VaR but different tails", () => {
    // Both have the same 5th percentile, but one has a catastrophic tail.
    const mild = [...Array.from({ length: 95 }, () => 0.01), ...Array.from({ length: 5 }, () => -0.05)];
    const severe = [...Array.from({ length: 95 }, () => 0.01), -0.05, -0.4, -0.6, -0.8, -0.9];
    expect(conditionalVaR(severe, 0.95)).toBeGreaterThan(conditionalVaR(mild, 0.95));
  });

  it("averages the tail rather than taking its edge", () => {
    const rets = [-0.10, -0.08, -0.06, ...Array.from({ length: 27 }, () => 0.01)];
    const cvar = conditionalVaR(rets, 0.9);
    const var90 = valueAtRisk(rets, 0.9);
    expect(cvar).toBeGreaterThan(var90);
  });
});

describe("parametric VaR", () => {
  it("matches the closed form for a normal sample", () => {
    // Build a series with known mean and sd by construction.
    const rets = [-0.02, -0.01, 0, 0.01, 0.02];
    // mean 0, sample sd = sqrt(0.001/... ) -> compute directly
    const sd = Math.sqrt((0.0004 + 0.0001 + 0 + 0.0001 + 0.0004) / 4);
    const expected = -(0 + normalInverseCDF(0.05) * sd);
    expect(parametricVaR(rets, 0.95, normalInverseCDF)).toBeCloseTo(expected, 10);
  });

  it("understates tail risk relative to historical VaR for fat-tailed data", () => {
    // Build a two-component mixture: 95% of days are calm (sd 1%) and 5% are
    // turbulent (sd 8%). This is leptokurtic by construction.
    //
    // Why the proportions matter. The normal fit sees only the blended standard
    // deviation, sqrt(0.95*0.01^2 + 0.05*0.08^2) = 1.9%, giving a 99%
    // parametric VaR of about 2.33 * 1.9% = 4.4%. But the true 1% quantile sits
    // inside the turbulent component — reaching it requires being in that 5%
    // AND in its worst fifth — which lands near 0.84 * 8% = 6.7%.
    //
    // An earlier version of this test used a 1% crash frequency, which put the
    // 99% quantile exactly at the boundary between the calm bulk and the
    // crashes, so the historical estimate measured the bulk instead of the tail
    // and the comparison came out backwards. The contaminating fraction has to
    // be comfortably larger than the tail probability being measured.
    const normal = seededNormal(20260930);
    const uniform = mulberry32(31337);
    const rets: number[] = [];
    for (let i = 0; i < 100000; i++) {
      const turbulent = uniform() < 0.05;
      rets.push(normal() * (turbulent ? 0.08 : 0.01));
    }

    const historical = valueAtRisk(rets, 0.99);
    const parametric = parametricVaR(rets, 0.99, normalInverseCDF);
    expect(parametric).toBeLessThan(historical);
    // And the gap is substantial, not marginal.
    expect(parametric / historical).toBeLessThan(0.8);
  });

  it("agrees with historical VaR when the data really is normal", () => {
    // The flip side: with genuinely Gaussian returns the normal assumption is
    // correct, so the two estimates should nearly coincide. This confirms the
    // previous test detects fat tails rather than a bug in one estimator.
    const normal = seededNormal(777);
    const rets = Array.from({ length: 100000 }, () => normal() * 0.02);
    const historical = valueAtRisk(rets, 0.99);
    const parametric = parametricVaR(rets, 0.99, normalInverseCDF);
    expect(Math.abs(parametric / historical - 1)).toBeLessThan(0.05);
  });
});

describe("auxiliary metrics", () => {
  it("computes the hit rate", () => {
    expect(hitRate([0.1, -0.1, 0.1, 0.1])).toBeCloseTo(0.75, 12);
  });

  it("computes the profit factor", () => {
    expect(profitFactor([0.2, -0.1])).toBeCloseTo(2, 12);
  });

  it("reports Infinity profit factor when there are no losses", () => {
    expect(profitFactor([0.1, 0.2])).toBe(Infinity);
  });

  it("computes beta of 1 against itself", () => {
    const xs = [0.01, -0.02, 0.03, -0.01, 0.02];
    expect(beta(xs, xs)).toBeCloseTo(1, 10);
  });

  it("computes beta of 2 for a doubled series", () => {
    const xs = [0.01, -0.02, 0.03, -0.01, 0.02];
    expect(beta(xs.map((x) => 2 * x), xs)).toBeCloseTo(2, 10);
  });

  it("gives a Calmar ratio of zero when there is no drawdown", () => {
    expect(calmarRatio([0.001, 0.001, 0.001], 252)).toBe(0);
  });
});
