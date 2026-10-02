import { describe, it, expect } from "vitest";
import {
  mean, median, variance, standardDeviation, skewness, kurtosis, percentile,
  covariance, correlation, autocorrelation, rollingMean, rollingVolatility, summarise,
} from "@/lib/statistics/descriptive";

describe("central tendency", () => {
  it("computes the mean", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });

  it("computes the median for odd and even counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("rejects empty input rather than returning NaN", () => {
    expect(() => mean([])).toThrow();
    expect(() => median([])).toThrow();
  });
});

describe("variance and standard deviation", () => {
  // Hand-checkable: data [2,4,4,4,5,5,7,9], mean 5.
  // Squared deviations: 9,1,1,1,0,0,4,16 = 32.
  // Population variance 32/8 = 4; sample variance 32/7 = 4.571428...
  it("matches a hand-computed population variance", () => {
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9], 0)).toBeCloseTo(4, 12);
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9], 0)).toBeCloseTo(2, 12);
  });

  it("applies Bessel's correction for the sample variance", () => {
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9], 1)).toBeCloseTo(32 / 7, 12);
  });

  it("can never be negative, even for a constant series", () => {
    expect(variance([5, 5, 5, 5], 1)).toBe(0);
    expect(variance([1e9, 1e9, 1e9], 1)).toBeGreaterThanOrEqual(0);
  });

  it("is zero for a single observation with ddof=1", () => {
    expect(variance([42], 1)).toBe(0);
  });
});

describe("higher moments", () => {
  it("reports ~zero skewness for a symmetric sample", () => {
    expect(Math.abs(skewness([1, 2, 3, 4, 5]))).toBeLessThan(1e-12);
  });

  it("reports positive skewness for a right-tailed sample", () => {
    expect(skewness([1, 1, 1, 1, 2, 2, 3, 20])).toBeGreaterThan(0);
  });

  it("reports positive excess kurtosis for a fat-tailed sample", () => {
    const thin = [-1, -1, -1, 0, 0, 0, 0, 1, 1, 1];
    const fat = [0, 0, 0, 0, 0, 0, 0, 0, -8, 8];
    expect(kurtosis(fat)).toBeGreaterThan(kurtosis(thin));
  });
});

describe("percentiles", () => {
  // NumPy: np.percentile([1,2,3,4], 50) == 2.5, and 25 -> 1.75
  it("interpolates linearly between order statistics", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBeCloseTo(2.5, 12);
    expect(percentile([1, 2, 3, 4], 25)).toBeCloseTo(1.75, 12);
  });

  it("returns the extremes at 0 and 100", () => {
    expect(percentile([5, 1, 9, 3], 0)).toBe(1);
    expect(percentile([5, 1, 9, 3], 100)).toBe(9);
  });

  it("rejects out-of-range percentiles", () => {
    expect(() => percentile([1, 2], 101)).toThrow();
    expect(() => percentile([1, 2], -1)).toThrow();
  });

  it("does not mutate the caller's array", () => {
    const xs = [3, 1, 2];
    percentile(xs, 50);
    expect(xs).toEqual([3, 1, 2]);
  });
});

describe("covariance and correlation", () => {
  it("gives correlation 1 for identical arrays", () => {
    const xs = [1, 4, 2, 8, 5, 7];
    expect(correlation(xs, xs)).toBeCloseTo(1, 12);
  });

  it("gives correlation -1 for a negated array", () => {
    const xs = [1, 4, 2, 8, 5, 7];
    expect(correlation(xs, xs.map((x) => -x))).toBeCloseTo(-1, 12);
  });

  it("is invariant to positive affine rescaling", () => {
    const xs = [1, 4, 2, 8, 5, 7];
    const ys = xs.map((x) => 3 * x + 100);
    expect(correlation(xs, ys)).toBeCloseTo(1, 12);
  });

  it("stays within [-1, 1]", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7];
    const ys = [2, 1, 4, 3, 7, 5, 6];
    const r = correlation(xs, ys);
    expect(r).toBeLessThanOrEqual(1);
    expect(r).toBeGreaterThanOrEqual(-1);
  });

  it("returns 0 rather than NaN when a series is constant", () => {
    expect(correlation([1, 1, 1, 1], [1, 2, 3, 4])).toBe(0);
  });

  it("relates to covariance by the definition rho = cov / (sx*sy)", () => {
    const xs = [2, 4, 6, 9, 3];
    const ys = [1, 5, 2, 8, 4];
    const expected = covariance(xs, ys, 1) / (standardDeviation(xs, 1) * standardDeviation(ys, 1));
    expect(correlation(xs, ys)).toBeCloseTo(expected, 12);
  });

  it("rejects mismatched lengths", () => {
    expect(() => covariance([1, 2], [1, 2, 3])).toThrow();
  });
});

describe("autocorrelation", () => {
  it("is exactly 1 at lag 0", () => {
    expect(autocorrelation([1, 5, 2, 8], 0)).toBe(1);
  });

  it("detects positive lag-1 autocorrelation in a trending series", () => {
    // A deterministic alternating-free upward series has strong lag-1 memory.
    const trending = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(autocorrelation(trending, 1)).toBeGreaterThan(0.5);
  });

  it("detects negative lag-1 autocorrelation in an alternating series", () => {
    const alternating = [1, -1, 1, -1, 1, -1, 1, -1, 1, -1];
    expect(autocorrelation(alternating, 1)).toBeLessThan(-0.5);
  });

  it("returns 0 for a lag beyond the series length", () => {
    expect(autocorrelation([1, 2, 3], 5)).toBe(0);
  });
});

describe("rolling windows", () => {
  it("returns null until the window is full, then the trailing mean", () => {
    expect(rollingMean([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("keeps the same length as the input", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7];
    expect(rollingMean(xs, 4)).toHaveLength(xs.length);
    expect(rollingVolatility(xs, 4)).toHaveLength(xs.length);
  });

  it("annualises volatility by sqrt(periodsPerYear)", () => {
    const rets = [0.01, -0.02, 0.015, 0.005, -0.01, 0.02];
    const raw = rollingVolatility(rets, 6, 1);
    const annual = rollingVolatility(rets, 6, 252);
    expect(annual[5]! / raw[5]!).toBeCloseTo(Math.sqrt(252), 10);
  });

  it("rejects an invalid window", () => {
    expect(() => rollingMean([1, 2, 3], 0)).toThrow();
    expect(() => rollingVolatility([1, 2, 3], 1)).toThrow();
  });
});

describe("summarise", () => {
  it("orders the percentiles correctly", () => {
    const xs = Array.from({ length: 200 }, (_, i) => Math.sin(i) * 10 + i * 0.1);
    const s = summarise(xs);
    expect(s.min).toBeLessThanOrEqual(s.p5);
    expect(s.p5).toBeLessThanOrEqual(s.p25);
    expect(s.p25).toBeLessThanOrEqual(s.median);
    expect(s.median).toBeLessThanOrEqual(s.p75);
    expect(s.p75).toBeLessThanOrEqual(s.p95);
    expect(s.p95).toBeLessThanOrEqual(s.max);
    expect(s.count).toBe(200);
  });
});
