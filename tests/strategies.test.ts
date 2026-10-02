import { describe, it, expect } from "vitest";
import { applyStrategy, strategySharpe, type StrategyParams } from "@/lib/finance/strategies";
import { generateGBM } from "@/lib/simulation/generators";
import { returns as toReturns } from "@/lib/finance/performance";

const params: StrategyParams = { fastWindow: 10, slowWindow: 50, lookback: 20, threshold: 0.02, seed: 42 };

function makeSeries(seed = 1, steps = 500) {
  const prices = generateGBM({ initialPrice: 100, drift: 0.08, volatility: 0.2, steps, horizonYears: steps / 252, seed });
  return { prices, rets: toReturns(prices) };
}

describe("position alignment and look-ahead bias", () => {
  it("never uses the same day's signal to trade that day", () => {
    // Construct a series where the signal is perfectly predictive of the SAME
    // day's return. A correctly-lagged backtest must NOT capture it.
    const rets = [0.1, -0.1, 0.1, -0.1, 0.1, -0.1, 0.1, -0.1];
    const prices = [100];
    for (const r of rets) prices.push(prices[prices.length - 1] * (1 + r));

    // Momentum with lookback 1 and threshold 0 goes long after an up day.
    // Since this series alternates, going long after an up day means being long
    // on every DOWN day — a guaranteed loser. A look-ahead implementation would
    // instead show a guaranteed winner.
    const result = applyStrategy("momentum", prices, rets, { ...params, lookback: 1, threshold: 0 }, 0);
    const total = result.equity[result.equity.length - 1] - 1;
    expect(total).toBeLessThan(0);
  });

  it("holds no position on the first day", () => {
    const { prices, rets } = makeSeries();
    const result = applyStrategy("buyAndHold", prices, rets, params, 0);
    expect(result.positions[0]).toBe(0);
  });

  it("produces one position and one return per period", () => {
    const { prices, rets } = makeSeries(2, 300);
    const result = applyStrategy("movingAverageCrossover", prices, rets, params, 0);
    expect(result.positions).toHaveLength(rets.length);
    expect(result.returns).toHaveLength(rets.length);
    expect(result.equity).toHaveLength(rets.length + 1);
  });
});

describe("buy and hold", () => {
  it("tracks the underlying asset almost exactly", () => {
    const { prices, rets } = makeSeries(3, 500);
    const result = applyStrategy("buyAndHold", prices, rets, params, 0);
    // It misses only day 0, where the position is still being established.
    const assetTotal = prices[prices.length - 1] / prices[1] - 1;
    const strategyTotal = result.equity[result.equity.length - 1] - 1;
    expect(strategyTotal).toBeCloseTo(assetTotal, 8);
  });

  it("has essentially zero turnover", () => {
    const { prices, rets } = makeSeries(4);
    const result = applyStrategy("buyAndHold", prices, rets, params, 0);
    // One trade to get in, then nothing.
    expect(result.trades).toBe(1);
    expect(result.turnover).toBeCloseTo(1, 10);
  });

  it("is unaffected by transaction costs beyond the initial entry", () => {
    const { prices, rets } = makeSeries(5);
    const free = applyStrategy("buyAndHold", prices, rets, params, 0);
    const costly = applyStrategy("buyAndHold", prices, rets, params, 0.0025);
    expect(costly.totalCost).toBeCloseTo(0.0025, 10);
    expect(free.equity[free.equity.length - 1] - costly.equity[costly.equity.length - 1]).toBeLessThan(0.01);
  });
});

describe("always cash", () => {
  it("returns exactly zero and never trades", () => {
    const { prices, rets } = makeSeries(6);
    const result = applyStrategy("alwaysCash", prices, rets, params, 0.001);
    expect(result.equity[result.equity.length - 1]).toBe(1);
    expect(result.trades).toBe(0);
    expect(result.totalCost).toBe(0);
  });
});

describe("transaction costs", () => {
  it("charges on the absolute change in position", () => {
    const rets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const prices = new Array(11).fill(100);
    // Random strategy flips positions; cost must equal turnover * rate.
    const rate = 0.01;
    const result = applyStrategy("random", prices, rets, params, rate);
    expect(result.totalCost).toBeCloseTo(result.turnover * rate, 12);
  });

  it("monotonically reduces net returns as the rate rises", () => {
    const { prices, rets } = makeSeries(7, 800);
    let previous = Infinity;
    for (const cost of [0, 0.0005, 0.001, 0.0025]) {
      const result = applyStrategy("movingAverageCrossover", prices, rets, params, cost);
      const total = result.equity[result.equity.length - 1];
      expect(total).toBeLessThanOrEqual(previous + 1e-12);
      previous = total;
    }
  });

  it("leaves gross returns untouched while reducing net returns", () => {
    const { prices, rets } = makeSeries(8, 600);
    const free = applyStrategy("momentum", prices, rets, params, 0);
    const costly = applyStrategy("momentum", prices, rets, params, 0.002);
    expect(costly.grossReturns).toEqual(free.grossReturns);
    expect(costly.returns[1]).toBeLessThanOrEqual(free.returns[1]);
  });

  it("destroys a high-turnover strategy faster than a low-turnover one", () => {
    const { prices, rets } = makeSeries(9, 1000);
    const cost = 0.0025;
    const highTurnover = applyStrategy("random", prices, rets, params, cost);
    const lowTurnover = applyStrategy("buyAndHold", prices, rets, params, cost);
    expect(highTurnover.totalCost).toBeGreaterThan(lowTurnover.totalCost * 10);
  });
});

describe("signal behaviour", () => {
  it("keeps positions within [0, 1] for every strategy", () => {
    const { prices, rets } = makeSeries(10, 600);
    for (const kind of ["buyAndHold", "movingAverageCrossover", "momentum", "meanReversion", "random", "alwaysCash"] as const) {
      const result = applyStrategy(kind, prices, rets, params, 0);
      for (const p of result.positions) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });

  it("stays flat while the moving-average window is still filling", () => {
    const { prices, rets } = makeSeries(11, 400);
    const result = applyStrategy("movingAverageCrossover", prices, rets, { ...params, slowWindow: 100 }, 0);
    // Before the slow window has enough data there is no signal, so no position.
    for (let i = 0; i < 90; i++) expect(result.positions[i]).toBe(0);
  });

  it("is reproducible for the random strategy given a seed", () => {
    const { prices, rets } = makeSeries(12, 300);
    const a = applyStrategy("random", prices, rets, params, 0);
    const b = applyStrategy("random", prices, rets, params, 0);
    expect(a.positions).toEqual(b.positions);
  });

  it("differs for the random strategy with a different seed", () => {
    const { prices, rets } = makeSeries(13, 300);
    const a = applyStrategy("random", prices, rets, { ...params, seed: 1 }, 0);
    const b = applyStrategy("random", prices, rets, { ...params, seed: 2 }, 0);
    expect(a.positions).not.toEqual(b.positions);
  });

  it("gives the oracle full exposure exactly during regime 0", () => {
    const { prices, rets } = makeSeries(14, 200);
    const regimes = rets.map((_, i) => (i % 20 < 10 ? 0 : 1));
    const result = applyStrategy("oracle", prices, rets, params, 0, regimes);
    // Lagged by one day: position at t reflects regime at t-1.
    for (let t = 1; t < rets.length; t++) {
      expect(result.positions[t]).toBe(regimes[t - 1] === 0 ? 1 : 0);
    }
  });

  it("takes opposite positions for momentum and mean reversion at the same threshold", () => {
    const { prices, rets } = makeSeries(15, 500);
    const mom = applyStrategy("momentum", prices, rets, { ...params, threshold: 0 }, 0);
    const rev = applyStrategy("meanReversion", prices, rets, { ...params, threshold: 0 }, 0);
    // With threshold 0 the two rules partition the days (modulo exact ties).
    let opposite = 0;
    for (let i = params.lookback + 2; i < rets.length; i++) {
      if (mom.positions[i] !== rev.positions[i]) opposite += 1;
    }
    expect(opposite / (rets.length - params.lookback - 2)).toBeGreaterThan(0.9);
  });
});

describe("strategySharpe", () => {
  it("is zero for a constant return series", () => {
    expect(strategySharpe([0.001, 0.001, 0.001])).toBe(0);
  });

  it("is zero for an empty or single-element series", () => {
    expect(strategySharpe([])).toBe(0);
    expect(strategySharpe([0.01])).toBe(0);
  });

  it("is negative for a consistently losing series", () => {
    const losing = Array.from({ length: 100 }, (_, i) => -0.001 + (i % 2 === 0 ? 0.0002 : -0.0002));
    expect(strategySharpe(losing)).toBeLessThan(0);
  });
});
