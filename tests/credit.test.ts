import { describe, it, expect } from "vitest";
import {
  mertonModel, creditSpreadTermStructure, impliedEquityVolatility,
  portfolioLossDistribution, type MertonInputs,
} from "@/lib/finance/credit";
import { blackScholesCall } from "@/lib/finance/blackScholes";

const base: MertonInputs = {
  assetValue: 100,
  debtFaceValue: 70,
  maturity: 5,
  assetVolatility: 0.25,
  riskFreeRate: 0.04,
};

describe("the structural identity", () => {
  it("prices equity exactly as a call on the firm's assets", () => {
    // The entire model in one assertion: equity IS a call struck at the debt.
    const r = mertonModel(base);
    const asCall = blackScholesCall({
      spot: base.assetValue, strike: base.debtFaceValue, timeToExpiry: base.maturity,
      riskFreeRate: base.riskFreeRate, volatility: base.assetVolatility,
    });
    expect(r.equityValue).toBeCloseTo(asCall, 10);
  });

  it("splits the firm's value between equity and debt with nothing lost", () => {
    const r = mertonModel(base);
    expect(r.equityValue + r.debtValue).toBeCloseTo(base.assetValue, 10);
  });

  it("values risky debt below risk-free debt", () => {
    const r = mertonModel(base);
    expect(r.debtValue).toBeLessThan(r.riskFreeDebtValue);
  });

  it("gives a positive credit spread for a leveraged firm", () => {
    expect(mertonModel(base).creditSpread).toBeGreaterThan(0);
  });

  it("validates inputs", () => {
    expect(() => mertonModel({ ...base, assetValue: 0 })).toThrow();
    expect(() => mertonModel({ ...base, debtFaceValue: -1 })).toThrow();
    expect(() => mertonModel({ ...base, maturity: 0 })).toThrow();
    expect(() => mertonModel({ ...base, assetVolatility: -0.1 })).toThrow();
  });
});

describe("default probability", () => {
  it("rises with leverage", () => {
    let previous = 0;
    for (const debt of [40, 60, 80, 100, 120]) {
      const p = mertonModel({ ...base, debtFaceValue: debt }).riskNeutralDefaultProbability;
      expect(p).toBeGreaterThan(previous);
      previous = p;
    }
  });

  it("rises with asset volatility", () => {
    let previous = 0;
    for (const vol of [0.1, 0.2, 0.3, 0.5, 0.8]) {
      const p = mertonModel({ ...base, assetVolatility: vol }).riskNeutralDefaultProbability;
      expect(p).toBeGreaterThan(previous);
      previous = p;
    }
  });

  it("stays within [0, 1]", () => {
    for (const debt of [10, 50, 100, 200, 500]) {
      const p = mertonModel({ ...base, debtFaceValue: debt }).riskNeutralDefaultProbability;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("approaches zero for a firm with almost no debt", () => {
    expect(mertonModel({ ...base, debtFaceValue: 1 }).riskNeutralDefaultProbability).toBeLessThan(0.001);
  });

  it("approaches one for a firm overwhelmed by debt", () => {
    expect(mertonModel({ ...base, debtFaceValue: 10000 }).riskNeutralDefaultProbability).toBeGreaterThan(0.99);
  });

  it("separates risk-neutral from real-world probability when drift exceeds the risk-free rate", () => {
    // A firm expected to grow faster than the risk-free rate defaults LESS often
    // in reality than the risk-neutral measure implies. Conflating the two is a
    // standard error, and it always runs in this direction.
    const r = mertonModel({ ...base, assetDrift: 0.12 });
    expect(r.realWorldDefaultProbability).toBeLessThan(r.riskNeutralDefaultProbability);
  });

  it("makes the two probabilities coincide when drift equals the risk-free rate", () => {
    const r = mertonModel({ ...base, assetDrift: base.riskFreeRate });
    expect(r.realWorldDefaultProbability).toBeCloseTo(r.riskNeutralDefaultProbability, 10);
  });
});

describe("distance to default", () => {
  it("falls as leverage rises", () => {
    let previous = Infinity;
    for (const debt of [30, 50, 70, 90]) {
      const dd = mertonModel({ ...base, debtFaceValue: debt }).distanceToDefault;
      expect(dd).toBeLessThan(previous);
      previous = dd;
    }
  });

  it("is negative for a firm already worth less than its debt", () => {
    expect(mertonModel({ ...base, debtFaceValue: 300 }).distanceToDefault).toBeLessThan(0);
  });

  it("maps monotonically to default probability", () => {
    // Higher distance to default must mean lower default probability.
    const a = mertonModel({ ...base, debtFaceValue: 50 });
    const b = mertonModel({ ...base, debtFaceValue: 90 });
    expect(a.distanceToDefault).toBeGreaterThan(b.distanceToDefault);
    expect(a.realWorldDefaultProbability).toBeLessThan(b.realWorldDefaultProbability);
  });
});

describe("credit spread", () => {
  it("rises with leverage", () => {
    let previous = -1;
    for (const debt of [30, 50, 70, 90]) {
      const s = mertonModel({ ...base, debtFaceValue: debt }).creditSpread;
      expect(s).toBeGreaterThan(previous);
      previous = s;
    }
  });

  it("rises with asset volatility", () => {
    const low = mertonModel({ ...base, assetVolatility: 0.1 }).creditSpread;
    const high = mertonModel({ ...base, assetVolatility: 0.5 }).creditSpread;
    expect(high).toBeGreaterThan(low);
  });

  it("collapses toward zero at very short maturity — the model's famous failure", () => {
    // For a solvent firm the assets cannot diffuse below the debt in no time,
    // so the spread vanishes. Real short-dated spreads do not, which is the
    // standard evidence that defaults involve jumps.
    const term = creditSpreadTermStructure(base, [0.01, 0.1, 1, 5, 10]);
    expect(term[0].spread).toBeLessThan(1e-6);
    expect(term[0].spread).toBeLessThan(term[3].spread);
  });

  it("produces a term structure of the right length with non-negative spreads", () => {
    const term = creditSpreadTermStructure(base, [0.5, 1, 2, 5, 10, 20]);
    expect(term).toHaveLength(6);
    for (const point of term) expect(point.spread).toBeGreaterThanOrEqual(-1e-12);
  });

  it("is essentially zero for a firm with negligible debt", () => {
    expect(mertonModel({ ...base, debtFaceValue: 0.01 }).creditSpread).toBeLessThan(1e-6);
  });
});

describe("equity volatility", () => {
  it("exceeds asset volatility because equity is a levered claim", () => {
    expect(impliedEquityVolatility(base)).toBeGreaterThan(base.assetVolatility);
  });

  it("rises as leverage rises", () => {
    const low = impliedEquityVolatility({ ...base, debtFaceValue: 30 });
    const high = impliedEquityVolatility({ ...base, debtFaceValue: 85 });
    expect(high).toBeGreaterThan(low);
  });

  it("approaches asset volatility for an unlevered firm", () => {
    // With almost no debt, equity is the firm, so their volatilities coincide.
    expect(impliedEquityVolatility({ ...base, debtFaceValue: 0.01 })).toBeCloseTo(base.assetVolatility, 3);
  });
});

describe("recovery and expected loss", () => {
  it("keeps the recovery rate within [0, 1]", () => {
    for (const debt of [40, 70, 100, 150]) {
      const r = mertonModel({ ...base, debtFaceValue: debt }).recoveryRate;
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  it("gives expected loss consistent with the spread", () => {
    // Both measure the same shortfall, so they must move together.
    const low = mertonModel({ ...base, debtFaceValue: 40 });
    const high = mertonModel({ ...base, debtFaceValue: 95 });
    expect(high.expectedLoss).toBeGreaterThan(low.expectedLoss);
    expect(high.creditSpread).toBeGreaterThan(low.creditSpread);
  });

  it("gives near-zero expected loss for a safe firm", () => {
    expect(mertonModel({ ...base, debtFaceValue: 5 }).expectedLoss).toBeLessThan(0.001);
  });
});

describe("portfolio loss distribution", () => {
  it("produces probabilities summing to 1", () => {
    const dist = portfolioLossDistribution(50, 0.05, 0.6);
    expect(dist.reduce((a, d) => a + d.probability, 0)).toBeCloseTo(1, 8);
  });

  it("has mean defaults equal to n times p", () => {
    const n = 100;
    const p = 0.03;
    const dist = portfolioLossDistribution(n, p, 1);
    const mean = dist.reduce((a, d) => a + d.defaults * d.probability, 0);
    expect(mean).toBeCloseTo(n * p, 6);
  });

  it("scales loss fraction by loss given default", () => {
    const dist = portfolioLossDistribution(10, 0.1, 0.4);
    expect(dist[10].lossFraction).toBeCloseTo(0.4, 10);
    expect(dist[5].lossFraction).toBeCloseTo(0.2, 10);
  });

  it("concentrates mass near the expected count for independent exposures", () => {
    // Independence makes the distribution tight. This is the baseline the
    // correlation lesson is measured against.
    const dist = portfolioLossDistribution(100, 0.05, 1);
    const tailProbability = dist.filter((d) => d.defaults >= 15).reduce((a, d) => a + d.probability, 0);
    expect(tailProbability).toBeLessThan(0.001);
  });

  it("handles the single-exposure case", () => {
    const dist = portfolioLossDistribution(1, 0.2, 1);
    expect(dist).toHaveLength(2);
    expect(dist[0].probability).toBeCloseTo(0.8, 10);
    expect(dist[1].probability).toBeCloseTo(0.2, 10);
  });
});
