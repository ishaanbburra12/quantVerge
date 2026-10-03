/**
 * Binomial option pricing (Cox-Ross-Rubinstein).
 *
 * Black-Scholes gives a closed form, so why build a tree? Because the tree can
 * price things the formula cannot. A European option has one decision — hold to
 * expiry — and a formula suffices. An AMERICAN option can be exercised at any
 * time, which means a decision at every node, and no closed form exists.
 *
 * The tree is also the clearest possible illustration of risk-neutral pricing.
 * At each node you solve a one-period problem by replication, and the stock's
 * real expected return never appears — only the risk-free rate. Seeing that at
 * a single node explains why it holds for the whole model.
 */

import { blackScholes, type OptionType, type BlackScholesInputs } from "@/lib/finance/blackScholes";

export interface BinomialInputs {
  spot: number;
  strike: number;
  timeToExpiry: number;
  riskFreeRate: number;
  volatility: number;
  dividendYield?: number;
  /** Number of time steps in the tree. */
  steps: number;
  /** American options may be exercised early; European only at expiry. */
  american: boolean;
}

export interface BinomialResult {
  price: number;
  /** Up and down multipliers, and the risk-neutral probability. */
  up: number;
  down: number;
  riskNeutralProbability: number;
  /** Delta from the first step of the tree. */
  delta: number;
  /** For American options: the value of being allowed to exercise early. */
  earlyExercisePremium: number;
  /** Earliest time at which early exercise is optimal, if ever. */
  earliestExerciseTime: number | null;
  steps: number;
}

/**
 * Price an option on a Cox-Ross-Rubinstein tree.
 *
 * The CRR parameterisation chooses
 *   u = exp(sigma * sqrt(dt)),   d = 1/u
 * so the tree RECOMBINES — an up-then-down move lands exactly where a
 * down-then-up move does. That reduces the node count from 2^n to n(n+1)/2,
 * which is the difference between a 1,000-step tree being instant and being
 * impossible.
 *
 * The risk-neutral probability follows from requiring the discounted expected
 * stock price to equal today's price:
 *   p = (exp((r - q) * dt) - d) / (u - d)
 *
 * This is NOT the real probability of an up move, and it does not depend on the
 * stock's expected return. If p falls outside [0, 1] the parameters admit
 * arbitrage — which happens when the time step is too coarse for the volatility
 * — and we say so rather than returning a number.
 */
export function binomialPrice(inputs: BinomialInputs, type: OptionType): BinomialResult {
  const { spot, strike, timeToExpiry, riskFreeRate, volatility, steps, american } = inputs;
  const q = inputs.dividendYield ?? 0;

  if (!(spot > 0)) throw new Error("binomialPrice: spot must be positive");
  if (!(strike > 0)) throw new Error("binomialPrice: strike must be positive");
  if (!Number.isInteger(steps) || steps < 1) throw new Error("binomialPrice: steps must be a positive integer");
  if (timeToExpiry < 0) throw new Error("binomialPrice: timeToExpiry cannot be negative");

  const dt = timeToExpiry / steps;
  const up = Math.exp(volatility * Math.sqrt(dt));
  const down = 1 / up;
  const growth = Math.exp((riskFreeRate - q) * dt);
  const p = (growth - down) / (up - down);
  const discount = Math.exp(-riskFreeRate * dt);

  if (!(p >= 0 && p <= 1)) {
    throw new Error(
      `binomialPrice: risk-neutral probability ${p.toFixed(4)} is outside [0,1] — the time step is too coarse for this volatility, which would admit arbitrage. Increase the number of steps.`,
    );
  }

  const payoff = (price: number) =>
    type === "call" ? Math.max(0, price - strike) : Math.max(0, strike - price);

  // Terminal values. Node j at the final step has had j up-moves.
  let values = new Array<number>(steps + 1);
  for (let j = 0; j <= steps; j++) {
    values[j] = payoff(spot * up ** j * down ** (steps - j));
  }

  let earliestExerciseTime: number | null = null;
  let deltaAtRoot = 0;

  // Roll backwards through the tree.
  for (let i = steps - 1; i >= 0; i--) {
    const next = new Array<number>(i + 1);
    for (let j = 0; j <= i; j++) {
      // Value of holding: discounted risk-neutral expectation of the two
      // successor nodes.
      const hold = discount * (p * values[j + 1] + (1 - p) * values[j]);
      const nodePrice = spot * up ** j * down ** (i - j);

      if (american) {
        const exercise = payoff(nodePrice);
        if (exercise > hold) {
          // Record the EARLIEST time early exercise is ever optimal. We iterate
          // backwards, so each hit overwrites with a smaller time.
          earliestExerciseTime = i * dt;
          next[j] = exercise;
          continue;
        }
      }
      next[j] = hold;
    }

    // Delta from the two nodes one step from the root.
    if (i === 1) {
      const upPrice = spot * up;
      const downPrice = spot * down;
      deltaAtRoot = (next[1] - next[0]) / (upPrice - downPrice);
    }
    values = next;
  }

  const price = values[0];

  // The early-exercise premium is the gap between the American and European
  // prices on an otherwise identical tree.
  let earlyExercisePremium = 0;
  if (american) {
    const european = binomialPrice({ ...inputs, american: false }, type);
    earlyExercisePremium = price - european.price;
  }

  // For a one-step tree the loop above never reaches i === 1.
  if (steps === 1) {
    const upValue = payoff(spot * up);
    const downValue = payoff(spot * down);
    deltaAtRoot = (upValue - downValue) / (spot * up - spot * down);
  }

  return {
    price,
    up,
    down,
    riskNeutralProbability: p,
    delta: deltaAtRoot,
    earlyExercisePremium,
    earliestExerciseTime,
    steps,
  };
}

/**
 * Price at a range of step counts, alongside the Black-Scholes value.
 *
 * The convergence is worth watching rather than assuming. A binomial price does
 * not approach Black-Scholes smoothly — it OSCILLATES, with odd and even step
 * counts converging from opposite sides. The cause is whether a tree node lands
 * exactly on the strike, which changes how the payoff kink is resolved. It is
 * why practitioners average adjacent step counts, and why a single tree price at
 * some arbitrary step count can be misleading.
 */
export function convergenceProfile(
  inputs: Omit<BinomialInputs, "steps">,
  type: OptionType,
  maxSteps = 120,
): { steps: number; binomial: number; blackScholes: number; error: number }[] {
  const bsInputs: BlackScholesInputs = {
    spot: inputs.spot,
    strike: inputs.strike,
    timeToExpiry: inputs.timeToExpiry,
    riskFreeRate: inputs.riskFreeRate,
    volatility: inputs.volatility,
    dividendYield: inputs.dividendYield,
  };
  const analytic = blackScholes(bsInputs, type).price;

  const out: { steps: number; binomial: number; blackScholes: number; error: number }[] = [];
  for (let n = 1; n <= maxSteps; n++) {
    try {
      const price = binomialPrice({ ...inputs, steps: n }, type).price;
      out.push({ steps: n, binomial: price, blackScholes: analytic, error: price - analytic });
    } catch {
      // Coarse trees can produce an inadmissible probability; skip those rather
      // than aborting the whole profile.
      continue;
    }
  }
  return out;
}

/**
 * Extract the tree's node prices for visualisation. Only practical for small
 * trees, so the caller is expected to cap the step count.
 */
export function treeNodes(inputs: BinomialInputs): { step: number; node: number; price: number }[] {
  const dt = inputs.timeToExpiry / inputs.steps;
  const up = Math.exp(inputs.volatility * Math.sqrt(dt));
  const down = 1 / up;
  const nodes: { step: number; node: number; price: number }[] = [];
  for (let i = 0; i <= inputs.steps; i++) {
    for (let j = 0; j <= i; j++) {
      nodes.push({ step: i, node: j, price: inputs.spot * up ** j * down ** (i - j) });
    }
  }
  return nodes;
}
