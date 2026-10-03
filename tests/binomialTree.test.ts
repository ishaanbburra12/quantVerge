import { describe, it, expect } from "vitest";
import { binomialPrice, convergenceProfile, treeNodes, type BinomialInputs } from "@/lib/finance/binomialTree";
import { blackScholes, blackScholesCall, blackScholesPut } from "@/lib/finance/blackScholes";

const base: Omit<BinomialInputs, "steps" | "american"> = {
  spot: 100, strike: 100, timeToExpiry: 1, riskFreeRate: 0.05, volatility: 0.2,
};
const euro = (steps: number, extra: Partial<BinomialInputs> = {}) =>
  ({ ...base, steps, american: false, ...extra }) as BinomialInputs;
const amer = (steps: number, extra: Partial<BinomialInputs> = {}) =>
  ({ ...base, steps, american: true, ...extra }) as BinomialInputs;

describe("tree construction", () => {
  it("builds a recombining tree: u * d = 1", () => {
    const r = binomialPrice(euro(50), "call");
    expect(r.up * r.down).toBeCloseTo(1, 12);
  });

  it("produces a valid risk-neutral probability", () => {
    const r = binomialPrice(euro(50), "call");
    expect(r.riskNeutralProbability).toBeGreaterThan(0);
    expect(r.riskNeutralProbability).toBeLessThan(1);
  });

  it("refuses a step size too coarse for the volatility", () => {
    // With tiny volatility and a long step, the risk-neutral probability falls
    // outside [0,1], which would imply arbitrage. Better to refuse than to
    // return a number.
    expect(() => binomialPrice(euro(1, { volatility: 0.001, riskFreeRate: 0.5 }), "call")).toThrow(/arbitrage/);
  });

  it("has the right number of nodes in a recombining tree", () => {
    // n steps gives (n+1)(n+2)/2 nodes, not 2^n.
    expect(treeNodes(euro(4)).length).toBe((4 + 1) * (4 + 2) / 2);
  });

  it("validates inputs", () => {
    expect(() => binomialPrice(euro(0), "call")).toThrow();
    expect(() => binomialPrice({ ...euro(10), spot: 0 }, "call")).toThrow();
    expect(() => binomialPrice({ ...euro(10), strike: -1 }, "call")).toThrow();
  });
});

describe("European pricing converges to Black-Scholes", () => {
  it("matches the canonical textbook call to 3 decimal places at 500 steps", () => {
    const tree = binomialPrice(euro(500), "call").price;
    expect(tree).toBeCloseTo(blackScholesCall(base), 2);
    expect(tree).toBeCloseTo(10.450584, 1);
  });

  it("matches the canonical put", () => {
    expect(binomialPrice(euro(500), "put").price).toBeCloseTo(blackScholesPut(base), 2);
  });

  it("improves as steps increase", () => {
    const analytic = blackScholesCall(base);
    const err = (n: number) => Math.abs(binomialPrice(euro(n), "call").price - analytic);
    // Compare well-separated step counts, because convergence oscillates.
    expect(err(400)).toBeLessThan(err(20));
    expect(err(800)).toBeLessThan(err(100));
  });

  it("oscillates rather than converging monotonically", () => {
    // A characteristic feature: odd and even step counts approach from opposite
    // sides, because whether a node lands on the strike changes how the payoff
    // kink is resolved. This is why practitioners average adjacent step counts.
    const analytic = blackScholesCall(base);
    const errors = [];
    for (let n = 50; n <= 70; n++) {
      errors.push(binomialPrice(euro(n), "call").price - analytic);
    }
    let signChanges = 0;
    for (let i = 1; i < errors.length; i++) {
      if (Math.sign(errors[i]) !== Math.sign(errors[i - 1])) signChanges++;
    }
    expect(signChanges).toBeGreaterThan(3);
  });

  it("matches across a range of moneyness", () => {
    for (const spot of [80, 90, 100, 110, 125]) {
      const tree = binomialPrice(euro(600, { spot }), "call").price;
      expect(tree).toBeCloseTo(blackScholesCall({ ...base, spot }), 1);
    }
  });

  it("handles dividends", () => {
    const withDiv = { ...base, dividendYield: 0.03 };
    const tree = binomialPrice(euro(600, { dividendYield: 0.03 }), "call").price;
    expect(tree).toBeCloseTo(blackScholesCall(withDiv), 1);
  });

  it("produces a delta close to the Black-Scholes delta", () => {
    const r = binomialPrice(euro(400), "call");
    expect(r.delta).toBeCloseTo(blackScholes(base, "call").greeks.delta, 2);
  });

  it("gives zero early-exercise premium for European options", () => {
    expect(binomialPrice(euro(100), "put").earlyExercisePremium).toBe(0);
    expect(binomialPrice(euro(100), "call").earlyExercisePremium).toBe(0);
  });
});

describe("American options", () => {
  it("is never worth less than the equivalent European option", () => {
    // Early exercise is an extra right, never an obligation, so it cannot
    // reduce value. This must hold for every parameter set.
    for (const spot of [70, 85, 100, 115, 130]) {
      for (const type of ["call", "put"] as const) {
        const a = binomialPrice(amer(200, { spot }), type).price;
        const e = binomialPrice(euro(200, { spot }), type).price;
        expect(a).toBeGreaterThanOrEqual(e - 1e-9);
      }
    }
  });

  it("gives an American call on a non-dividend stock the SAME value as European", () => {
    // The classic result: it is never optimal to exercise an American call
    // early when there are no dividends, so the early-exercise right is
    // worthless and the two prices coincide.
    const a = binomialPrice(amer(300), "call");
    const e = binomialPrice(euro(300), "call");
    expect(a.price).toBeCloseTo(e.price, 8);
    expect(a.earlyExercisePremium).toBeCloseTo(0, 8);
    expect(a.earliestExerciseTime).toBeNull();
  });

  it("gives an American put a strictly positive early-exercise premium", () => {
    // Puts are different: deep in the money, exercising frees the strike to earn
    // interest, which can beat holding.
    const r = binomialPrice(amer(300, { spot: 70 }), "put");
    expect(r.earlyExercisePremium).toBeGreaterThan(0.01);
    expect(r.earliestExerciseTime).not.toBeNull();
  });

  it("raises the American put premium as rates rise", () => {
    // Higher rates make the interest on the freed strike worth more.
    const low = binomialPrice(amer(300, { spot: 75, riskFreeRate: 0.01 }), "put").earlyExercisePremium;
    const high = binomialPrice(amer(300, { spot: 75, riskFreeRate: 0.10 }), "put").earlyExercisePremium;
    expect(high).toBeGreaterThan(low);
  });

  it("makes an American call valuable to exercise early when dividends are large", () => {
    // With a big dividend yield, exercising a deep in-the-money call early to
    // capture the dividend can be optimal.
    const r = binomialPrice(amer(300, { spot: 140, dividendYield: 0.12 }), "call");
    expect(r.earlyExercisePremium).toBeGreaterThan(0);
  });

  it("is at least the intrinsic value everywhere", () => {
    // An American option can always be exercised immediately, so it can never
    // trade below intrinsic.
    for (const spot of [60, 80, 100, 120, 140]) {
      const put = binomialPrice(amer(150, { spot }), "put").price;
      expect(put).toBeGreaterThanOrEqual(Math.max(0, 100 - spot) - 1e-9);
      const call = binomialPrice(amer(150, { spot }), "call").price;
      expect(call).toBeGreaterThanOrEqual(Math.max(0, spot - 100) - 1e-9);
    }
  });
});

describe("convergence profile", () => {
  it("returns one entry per step count with a constant analytic price", () => {
    const profile = convergenceProfile({ ...base, american: false }, "call", 60);
    expect(profile.length).toBeGreaterThan(50);
    const analytic = profile[0].blackScholes;
    for (const row of profile) expect(row.blackScholes).toBeCloseTo(analytic, 12);
  });

  it("shrinks the error envelope as steps grow", () => {
    const profile = convergenceProfile({ ...base, american: false }, "call", 200);
    const early = profile.slice(5, 25).map((r) => Math.abs(r.error));
    const late = profile.slice(170, 190).map((r) => Math.abs(r.error));
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(avg(late)).toBeLessThan(avg(early));
  });
});
