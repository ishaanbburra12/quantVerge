import { describe, it, expect } from "vitest";
import {
  incompleteBeta, studentTCDF, studentTInverse, oneSampleTTest, power,
  requiredSampleSize, bonferroni, benjaminiHochberg, familyWiseErrorRate,
  sharpeStandardError,
} from "@/lib/statistics/inference";
import { normalCDF } from "@/lib/math/distributions";
import { seededNormal } from "@/lib/math/random";

describe("incomplete beta", () => {
  it("is 0 at x=0 and 1 at x=1", () => {
    expect(incompleteBeta(0, 2, 3)).toBe(0);
    expect(incompleteBeta(1, 2, 3)).toBe(1);
  });

  it("equals x for a = b = 1 (the uniform case)", () => {
    for (const x of [0.1, 0.33, 0.5, 0.75, 0.9]) {
      expect(incompleteBeta(x, 1, 1)).toBeCloseTo(x, 10);
    }
  });

  it("satisfies the symmetry relation I_x(a,b) = 1 - I_{1-x}(b,a)", () => {
    for (const [x, a, b] of [[0.3, 2, 5], [0.7, 4, 2], [0.5, 3, 3]] as const) {
      expect(incompleteBeta(x, a, b)).toBeCloseTo(1 - incompleteBeta(1 - x, b, a), 10);
    }
  });

  it("is monotonically increasing in x", () => {
    let previous = -1;
    for (let x = 0.05; x < 1; x += 0.05) {
      const v = incompleteBeta(x, 2.5, 4);
      expect(v).toBeGreaterThan(previous);
      previous = v;
    }
  });
});

describe("Student t distribution", () => {
  it("is symmetric about zero", () => {
    expect(studentTCDF(0, 10)).toBeCloseTo(0.5, 10);
    for (const t of [0.5, 1.2, 2.4]) {
      expect(studentTCDF(-t, 8)).toBeCloseTo(1 - studentTCDF(t, 8), 10);
    }
  });

  it("matches published critical values", () => {
    // Two-sided 95% critical values from standard t-tables.
    expect(studentTInverse(0.975, 1)).toBeCloseTo(12.706, 2);
    expect(studentTInverse(0.975, 5)).toBeCloseTo(2.571, 3);
    expect(studentTInverse(0.975, 10)).toBeCloseTo(2.228, 3);
    expect(studentTInverse(0.975, 30)).toBeCloseTo(2.042, 3);
    expect(studentTInverse(0.975, 100)).toBeCloseTo(1.984, 3);
  });

  it("approaches the normal distribution as df grows", () => {
    // The whole point of the t-distribution: the penalty for estimating sigma
    // vanishes once the sample is large.
    for (const t of [0.5, 1.0, 1.96, 2.5]) {
      expect(studentTCDF(t, 5000)).toBeCloseTo(normalCDF(t), 3);
    }
  });

  it("has fatter tails than the normal at small df", () => {
    // P(T > 2) exceeds P(Z > 2), which is why small samples need wider intervals.
    expect(1 - studentTCDF(2, 3)).toBeGreaterThan(1 - normalCDF(2));
    expect(studentTInverse(0.975, 3)).toBeGreaterThan(1.96);
  });

  it("inverts its own CDF", () => {
    for (const p of [0.01, 0.1, 0.5, 0.9, 0.99]) {
      for (const nu of [3, 12, 60]) {
        expect(studentTCDF(studentTInverse(p, nu), nu)).toBeCloseTo(p, 8);
      }
    }
  });

  it("rejects invalid degrees of freedom", () => {
    expect(() => studentTCDF(1, 0)).toThrow();
    expect(() => studentTInverse(0, 10)).toThrow();
  });
});

describe("one-sample t-test", () => {
  it("reproduces a hand-computable example", () => {
    // Sample [1,2,3,4,5]: mean 3, sample sd sqrt(2.5)=1.5811, n=5
    // SE = 1.5811/sqrt(5) = 0.7071; t = (3-0)/0.7071 = 4.2426
    const r = oneSampleTTest([1, 2, 3, 4, 5], 0);
    expect(r.sampleMean).toBeCloseTo(3, 10);
    expect(r.standardError).toBeCloseTo(0.70710678, 7);
    expect(r.statistic).toBeCloseTo(4.2426407, 6);
    expect(r.degreesOfFreedom).toBe(4);
    expect(r.pValue).toBeLessThan(0.05);
  });

  it("gives t = 0 and p = 1 when the sample mean equals the null", () => {
    const r = oneSampleTTest([1, 2, 3, 4, 5], 3);
    expect(r.statistic).toBeCloseTo(0, 10);
    expect(r.pValue).toBeCloseTo(1, 10);
    expect(r.rejectAtAlpha).toBe(false);
  });

  it("produces a confidence interval containing the sample mean", () => {
    const r = oneSampleTTest([2, 4, 4, 4, 5, 5, 7, 9], 0);
    expect(r.confidenceInterval[0]).toBeLessThan(r.sampleMean);
    expect(r.confidenceInterval[1]).toBeGreaterThan(r.sampleMean);
  });

  it("excludes the null from the interval exactly when it rejects", () => {
    const sample = [0.4, 0.9, 1.2, 0.7, 1.5, 1.1, 0.8];
    const r = oneSampleTTest(sample, 0, 0.05);
    const excludesZero = r.confidenceInterval[0] > 0 || r.confidenceInterval[1] < 0;
    expect(excludesZero).toBe(r.rejectAtAlpha);
  });

  it("narrows the interval as the sample grows", () => {
    const normal = seededNormal(42);
    const small = Array.from({ length: 10 }, () => normal());
    const large = Array.from({ length: 1000 }, () => normal());
    const w = (r: ReturnType<typeof oneSampleTTest>) => r.confidenceInterval[1] - r.confidenceInterval[0];
    expect(w(oneSampleTTest(large, 0))).toBeLessThan(w(oneSampleTTest(small, 0)));
  });

  it("gives a smaller one-sided p-value in the correct direction", () => {
    const sample = [1, 2, 3, 4, 5];
    const two = oneSampleTTest(sample, 0, 0.05, "two-sided").pValue;
    const greater = oneSampleTTest(sample, 0, 0.05, "greater").pValue;
    expect(greater).toBeCloseTo(two / 2, 10);
  });

  it("handles a constant sample without returning infinite significance", () => {
    const r = oneSampleTTest([5, 5, 5, 5], 0);
    expect(Number.isFinite(r.statistic)).toBe(true);
    expect(r.pValue).toBe(1);
    expect(r.rejectAtAlpha).toBe(false);
  });

  it("rejects a sample that is too small", () => {
    expect(() => oneSampleTTest([1], 0)).toThrow();
  });

  it("controls the false positive rate under a true null", () => {
    // The defining property: testing a TRUE null at alpha=0.05 should reject
    // about 5% of the time. This is simultaneously a test of the t CDF.
    const normal = seededNormal(20261001);
    let rejections = 0;
    const trials = 4000;
    for (let i = 0; i < trials; i++) {
      const sample = Array.from({ length: 12 }, () => normal());
      if (oneSampleTTest(sample, 0, 0.05).rejectAtAlpha) rejections++;
    }
    const rate = rejections / trials;
    // Binomial standard error at p=0.05, n=4000 is 0.0034; allow 4 of them.
    expect(Math.abs(rate - 0.05)).toBeLessThan(0.014);
  });
});

describe("power", () => {
  it("equals alpha when the true effect is zero", () => {
    // With no effect, rejecting is a false positive and happens at rate alpha.
    expect(power(0, 1, 0.05)).toBeCloseTo(0.05, 6);
  });

  it("rises with effect size", () => {
    let previous = 0;
    for (const e of [0, 0.5, 1, 2, 3, 4]) {
      const p = power(e, 1, 0.05);
      expect(p).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = p;
    }
  });

  it("rises as the standard error falls", () => {
    expect(power(1, 0.25, 0.05)).toBeGreaterThan(power(1, 1, 0.05));
  });

  it("approaches 1 for a large effect", () => {
    expect(power(10, 1, 0.05)).toBeCloseTo(1, 6);
  });

  it("gives the textbook ~80% power at an effect of 2.8 standard errors", () => {
    expect(power(2.8, 1, 0.05)).toBeGreaterThan(0.79);
    expect(power(2.8, 1, 0.05)).toBeLessThan(0.81);
  });
});

describe("required sample size", () => {
  it("matches the standard formula", () => {
    // n = (1.96 + 0.8416)^2 * sigma^2 / effect^2
    const n = requiredSampleSize(0.5, 1, 0.8, 0.05);
    expect(n).toBeGreaterThan(30);
    expect(n).toBeLessThan(35);
  });

  it("quadruples when the effect halves", () => {
    const a = requiredSampleSize(1, 1, 0.8, 0.05);
    const b = requiredSampleSize(0.5, 1, 0.8, 0.05);
    expect(b / a).toBeGreaterThan(3.8);
    expect(b / a).toBeLessThan(4.2);
  });

  it("is infinite for a zero effect", () => {
    expect(requiredSampleSize(0, 1)).toBe(Infinity);
  });
});

describe("multiple testing", () => {
  it("computes the family-wise error rate", () => {
    expect(familyWiseErrorRate(1, 0.05)).toBeCloseTo(0.05, 10);
    expect(familyWiseErrorRate(20, 0.05)).toBeCloseTo(0.6415, 3);
    expect(familyWiseErrorRate(100, 0.05)).toBeGreaterThan(0.99);
  });

  it("applies the Bonferroni threshold", () => {
    const ps = [0.001, 0.01, 0.04, 0.2];
    // With m=4 and alpha=0.05 the threshold is 0.0125.
    expect(bonferroni(ps, 0.05)).toEqual([true, true, false, false]);
  });

  it("makes Benjamini-Hochberg at least as permissive as Bonferroni", () => {
    const ps = [0.001, 0.008, 0.02, 0.03, 0.2, 0.5];
    const bonf = bonferroni(ps, 0.05);
    const bh = benjaminiHochberg(ps, 0.05);
    for (let i = 0; i < ps.length; i++) {
      if (bonf[i]) expect(bh[i]).toBe(true);
    }
    expect(bh.filter(Boolean).length).toBeGreaterThanOrEqual(bonf.filter(Boolean).length);
  });

  it("rejects everything below the largest passing rank in BH", () => {
    // p = 0.03 passes at rank 4 (4/5 * 0.05 = 0.04), so ranks 1-4 all reject
    // even though 0.025 alone exceeds its own 3/5*0.05 = 0.03 threshold... and
    // this step-up behaviour is the defining feature of the procedure.
    const ps = [0.001, 0.02, 0.025, 0.03, 0.9];
    const bh = benjaminiHochberg(ps, 0.05);
    expect(bh).toEqual([true, true, true, true, false]);
  });

  it("rejects nothing when every p-value is large", () => {
    expect(benjaminiHochberg([0.4, 0.6, 0.9], 0.05)).toEqual([false, false, false]);
    expect(bonferroni([0.4, 0.6, 0.9], 0.05)).toEqual([false, false, false]);
  });

  it("preserves the input order in its output", () => {
    const ps = [0.9, 0.001, 0.5];
    expect(benjaminiHochberg(ps, 0.05)).toEqual([false, true, false]);
  });
});

describe("Sharpe standard error", () => {
  it("matches the known approximation", () => {
    // With 1 year of data and S=1: sqrt((1+0.5)/1) = 1.2247
    expect(sharpeStandardError(1, 1)).toBeCloseTo(1.22474, 4);
  });

  it("falls as 1/sqrt(n)", () => {
    const a = sharpeStandardError(0.5, 1);
    const b = sharpeStandardError(0.5, 100);
    expect(a / b).toBeCloseTo(10, 6);
  });

  it("shows a one-year Sharpe of 1.0 is indistinguishable from zero", () => {
    // The t-statistic is S/SE, which must exceed ~1.96 to be significant.
    const se = sharpeStandardError(1, 1);
    expect(1 / se).toBeLessThan(1.96);
  });

  it("shows 18 years are needed to distinguish a true Sharpe of 0.5 from zero", () => {
    // Solving 0.5/sqrt(1.125/n) > 1.96 gives n > 17.29, so 18 whole years.
    // 17 falls just short, which is worth knowing precisely rather than
    // approximately — it is the difference between a career and a career plus.
    expect(0.5 / sharpeStandardError(0.5, 17)).toBeLessThan(1.96);
    expect(0.5 / sharpeStandardError(0.5, 18)).toBeGreaterThan(1.96);
  });
});
