import { describe, it, expect } from "vitest";
import {
  bondCashFlows, presentValue, bondPrice, yieldToMaturity, bondRiskMeasures,
  approximatePriceChange, nelsonSiegel, buildYieldCurve, forwardRate,
  interpolateCurve, priceFromCurve, type BondSpec,
} from "@/lib/finance/fixedIncome";

const par: BondSpec = { faceValue: 100, couponRate: 0.05, maturity: 10, frequency: 2 };
const zero: BondSpec = { faceValue: 100, couponRate: 0, maturity: 10, frequency: 1 };

describe("cash flows", () => {
  it("produces one flow per period with the final one including principal", () => {
    const flows = bondCashFlows(par);
    expect(flows).toHaveLength(20);
    expect(flows[0].amount).toBeCloseTo(2.5, 10);
    expect(flows[19].amount).toBeCloseTo(102.5, 10);
  });

  it("lands the last flow exactly on the maturity date", () => {
    // Counting forwards and accumulating 1/frequency would drift; this checks
    // the backwards construction.
    for (const m of [1, 7, 10, 30]) {
      const flows = bondCashFlows({ ...par, maturity: m });
      expect(flows[flows.length - 1].time).toBeCloseTo(m, 12);
    }
  });

  it("gives a zero-coupon bond a single cash flow", () => {
    const flows = bondCashFlows(zero);
    expect(flows).toHaveLength(10);
    expect(flows.slice(0, 9).every((f) => f.amount === 0)).toBe(true);
    expect(flows[9].amount).toBe(100);
  });

  it("validates its inputs", () => {
    expect(() => bondCashFlows({ ...par, faceValue: 0 })).toThrow();
    expect(() => bondCashFlows({ ...par, maturity: 0 })).toThrow();
    expect(() => bondCashFlows({ ...par, couponRate: -0.01 })).toThrow();
    expect(() => bondCashFlows({ ...par, frequency: 0 })).toThrow();
  });
});

describe("pricing", () => {
  it("prices a bond at par when the yield equals the coupon", () => {
    // The defining identity of a par bond, and the strongest single check that
    // the discounting convention is right.
    expect(bondPrice(par, 0.05)).toBeCloseTo(100, 8);
  });

  it("prices at a discount above the coupon and a premium below it", () => {
    expect(bondPrice(par, 0.07)).toBeLessThan(100);
    expect(bondPrice(par, 0.03)).toBeGreaterThan(100);
  });

  it("prices a 10-year zero correctly", () => {
    // 100 / 1.05^10 = 61.391325...
    expect(bondPrice(zero, 0.05)).toBeCloseTo(100 / 1.05 ** 10, 10);
    expect(bondPrice(zero, 0.05)).toBeCloseTo(61.391325, 5);
  });

  it("falls monotonically as yield rises", () => {
    let previous = Infinity;
    for (const y of [0.0, 0.02, 0.04, 0.06, 0.08, 0.12]) {
      const p = bondPrice(par, y);
      expect(p).toBeLessThan(previous);
      previous = p;
    }
  });

  it("equals the undiscounted sum at zero yield", () => {
    const flows = bondCashFlows(par);
    const total = flows.reduce((a, f) => a + f.amount, 0);
    expect(bondPrice(par, 0)).toBeCloseTo(total, 8);
  });

  it("is convex in yield", () => {
    // The second difference of the price-yield curve must be positive.
    const h = 0.005;
    const up = bondPrice(par, 0.05 + h);
    const mid = bondPrice(par, 0.05);
    const down = bondPrice(par, 0.05 - h);
    expect(up - 2 * mid + down).toBeGreaterThan(0);
  });
});

describe("yield to maturity", () => {
  it("inverts the pricing function", () => {
    for (const y of [0.01, 0.03, 0.05, 0.08, 0.15]) {
      const price = bondPrice(par, y);
      expect(yieldToMaturity(par, price)!).toBeCloseTo(y, 8);
    }
  });

  it("returns the coupon rate for a bond priced at par", () => {
    expect(yieldToMaturity(par, 100)!).toBeCloseTo(0.05, 8);
  });

  it("works on a zero-coupon bond", () => {
    expect(yieldToMaturity(zero, 61.391325)!).toBeCloseTo(0.05, 6);
  });

  it("returns null for an unreachable price", () => {
    expect(yieldToMaturity(par, 1e6)).toBeNull();
    expect(yieldToMaturity(par, 0)).toBeNull();
  });
});

describe("duration and convexity", () => {
  it("gives a zero-coupon bond Macaulay duration equal to its maturity", () => {
    // The cleanest identity in fixed income: a zero's only cash flow is at
    // maturity, so the weighted average time to cash flow IS the maturity.
    const m = bondRiskMeasures(zero, 0.05);
    expect(m.macaulayDuration).toBeCloseTo(10, 10);
  });

  it("gives a coupon bond duration below its maturity", () => {
    const m = bondRiskMeasures(par, 0.05);
    expect(m.macaulayDuration).toBeLessThan(10);
    expect(m.macaulayDuration).toBeGreaterThan(7);
  });

  it("makes modified duration smaller than Macaulay duration", () => {
    const m = bondRiskMeasures(par, 0.05);
    expect(m.modifiedDuration).toBeLessThan(m.macaulayDuration);
    expect(m.modifiedDuration).toBeCloseTo(m.macaulayDuration / 1.025, 10);
  });

  it("matches modified duration against a finite-difference derivative", () => {
    // D_mod = -(1/P) dP/dy. This is the definitive check.
    const y = 0.05;
    const h = 1e-6;
    const p0 = bondPrice(par, y);
    const numerical = -((bondPrice(par, y + h) - bondPrice(par, y - h)) / (2 * h)) / p0;
    expect(bondRiskMeasures(par, y).modifiedDuration).toBeCloseTo(numerical, 6);
  });

  it("matches convexity against a finite-difference second derivative", () => {
    const y = 0.05;
    const h = 1e-4;
    const p0 = bondPrice(par, y);
    const numerical =
      (bondPrice(par, y + h) - 2 * p0 + bondPrice(par, y - h)) / (h * h) / p0;
    expect(bondRiskMeasures(par, y).convexity).toBeCloseTo(numerical, 3);
  });

  it("keeps convexity positive for an ordinary bond", () => {
    for (const y of [0.01, 0.05, 0.1]) {
      expect(bondRiskMeasures(par, y).convexity).toBeGreaterThan(0);
    }
  });

  it("gives longer bonds more duration", () => {
    let previous = 0;
    for (const m of [2, 5, 10, 20, 30]) {
      const d = bondRiskMeasures({ ...par, maturity: m }, 0.05).macaulayDuration;
      expect(d).toBeGreaterThan(previous);
      previous = d;
    }
  });

  it("gives higher coupons less duration", () => {
    // More of the value arrives earlier, pulling the balance point in.
    const low = bondRiskMeasures({ ...par, couponRate: 0.02 }, 0.05).macaulayDuration;
    const high = bondRiskMeasures({ ...par, couponRate: 0.10 }, 0.05).macaulayDuration;
    expect(high).toBeLessThan(low);
  });

  it("computes DV01 as the price move for one basis point", () => {
    const m = bondRiskMeasures(par, 0.05);
    const actual = bondPrice(par, 0.05) - bondPrice(par, 0.0501);
    expect(m.dv01).toBeCloseTo(actual, 4);
  });
});

describe("the duration approximation", () => {
  it("always understates the price for a move in either direction", () => {
    // Because the true price-yield relationship is convex, a tangent line lies
    // below it on both sides. This is why convexity is a desirable property and
    // not merely a correction term.
    const y = 0.05;
    const m = bondRiskMeasures(par, y);
    const p0 = m.price;
    for (const dy of [-0.02, -0.01, 0.01, 0.02]) {
      const exact = bondPrice(par, y + dy);
      const approx = p0 * (1 + approximatePriceChange(m, dy).durationOnly);
      expect(approx).toBeLessThan(exact);
    }
  });

  it("is improved by the convexity term", () => {
    const y = 0.05;
    const m = bondRiskMeasures(par, y);
    const dy = 0.02;
    const exact = bondPrice(par, y + dy);
    const dOnly = Math.abs(m.price * (1 + approximatePriceChange(m, dy).durationOnly) - exact);
    const withC = Math.abs(m.price * (1 + approximatePriceChange(m, dy).withConvexity) - exact);
    expect(withC).toBeLessThan(dOnly);
  });

  it("is nearly exact for very small moves", () => {
    const m = bondRiskMeasures(par, 0.05);
    const exact = bondPrice(par, 0.0501);
    const approx = m.price * (1 + approximatePriceChange(m, 0.0001).withConvexity);
    expect(approx).toBeCloseTo(exact, 6);
  });
});

describe("yield curves", () => {
  it("returns level + slope at the short end", () => {
    expect(nelsonSiegel(0, 0.045, -0.02, 0.01)).toBeCloseTo(0.025, 10);
  });

  it("approaches the level parameter at long maturities", () => {
    expect(nelsonSiegel(200, 0.045, -0.02, 0.01)).toBeCloseTo(0.045, 3);
  });

  it("is continuous near zero rather than dividing by zero", () => {
    expect(Number.isFinite(nelsonSiegel(1e-12, 0.04, -0.01, 0.01))).toBe(true);
    expect(nelsonSiegel(1e-9, 0.04, -0.01, 0.01)).toBeCloseTo(0.03, 6);
  });

  it("builds an upward-sloping normal curve", () => {
    const curve = buildYieldCurve("normal", [0.25, 1, 5, 10, 30]);
    expect(curve[curve.length - 1].rate).toBeGreaterThan(curve[0].rate);
  });

  it("builds a downward-sloping inverted curve", () => {
    const curve = buildYieldCurve("inverted", [0.25, 1, 5, 10, 30]);
    expect(curve[curve.length - 1].rate).toBeLessThan(curve[0].rate);
  });

  it("builds a flat curve that really is flat", () => {
    const curve = buildYieldCurve("flat", [0.25, 1, 5, 10, 30]);
    const rates = curve.map((p) => p.rate);
    expect(Math.max(...rates) - Math.min(...rates)).toBeLessThan(1e-9);
  });
});

describe("forward rates", () => {
  it("satisfies the no-arbitrage identity", () => {
    const y1 = 0.03, t1 = 1, y2 = 0.04, t2 = 2;
    const f = forwardRate(y1, t1, y2, t2);
    expect((1 + y1) ** t1 * (1 + f) ** (t2 - t1)).toBeCloseTo((1 + y2) ** t2, 10);
  });

  it("exceeds the spot rate when the curve slopes upward", () => {
    expect(forwardRate(0.03, 1, 0.04, 2)).toBeGreaterThan(0.04);
  });

  it("falls below the spot rate when the curve is inverted", () => {
    expect(forwardRate(0.05, 1, 0.04, 2)).toBeLessThan(0.04);
  });

  it("equals the flat rate when the curve is flat", () => {
    expect(forwardRate(0.04, 1, 0.04, 5)).toBeCloseTo(0.04, 10);
  });

  it("rejects a non-increasing interval", () => {
    expect(() => forwardRate(0.03, 2, 0.04, 1)).toThrow();
  });
});

describe("curve interpolation and pricing", () => {
  const curve = buildYieldCurve("normal", [0.5, 1, 2, 5, 10, 30]);

  it("interpolates between points and stays flat beyond the ends", () => {
    expect(interpolateCurve(curve, 0.1)).toBeCloseTo(curve[0].rate, 10);
    expect(interpolateCurve(curve, 100)).toBeCloseTo(curve[curve.length - 1].rate, 10);
    const mid = interpolateCurve(curve, 1.5);
    expect(mid).toBeGreaterThan(Math.min(curve[1].rate, curve[2].rate) - 1e-9);
    expect(mid).toBeLessThan(Math.max(curve[1].rate, curve[2].rate) + 1e-9);
  });

  it("prices a bond off the curve close to, but not equal to, the flat-yield price", () => {
    const bond: BondSpec = { faceValue: 100, couponRate: 0.04, maturity: 10, frequency: 2 };
    const curvePrice = priceFromCurve(bond, curve);
    expect(curvePrice).toBeGreaterThan(0);
    // A sloped curve discounts early and late flows differently, so the price
    // differs from any single flat yield.
    expect(curvePrice).not.toBeCloseTo(bondPrice(bond, curve[3].rate), 6);
  });

  it("agrees with flat-yield pricing when the curve is flat", () => {
    const flat = buildYieldCurve("flat", [0.5, 1, 2, 5, 10, 30]);
    const bond: BondSpec = { faceValue: 100, couponRate: 0.04, maturity: 10, frequency: 1 };
    expect(priceFromCurve(bond, flat)).toBeCloseTo(bondPrice(bond, flat[0].rate), 8);
  });
});
