/**
 * Fixed income: bond pricing, duration, convexity and yield curves.
 *
 * Bonds are where a great deal of quantitative finance actually happens, and the
 * mathematics is different in character from equity work. There is no simulation
 * here and almost no randomness — a bond's cash flows are contractual. The whole
 * problem is discounting them correctly and measuring how the price responds to
 * the discount rate, which makes it an exercise in calculus rather than
 * probability.
 */

/** A single scheduled cash flow. */
export interface CashFlow {
  /** Time until payment, in years. */
  time: number;
  /** Amount paid. */
  amount: number;
}

export interface BondSpec {
  /** Redemption value paid at maturity. */
  faceValue: number;
  /** Annual coupon rate as a decimal. 0 for a zero-coupon bond. */
  couponRate: number;
  /** Years until maturity. */
  maturity: number;
  /** Coupon payments per year. 2 is the common convention. */
  frequency: number;
}

/**
 * Enumerate a bond's cash flows.
 *
 * Coupons are paid `frequency` times a year, each of size
 * faceValue × couponRate / frequency. The final payment includes the face value.
 *
 * Periods are counted backwards from maturity so the last cash flow lands
 * exactly on the maturity date. Counting forwards and accumulating 1/frequency
 * repeatedly would drift by floating-point error over a 30-year bond.
 */
export function bondCashFlows(bond: BondSpec): CashFlow[] {
  const { faceValue, couponRate, maturity, frequency } = bond;
  if (!(faceValue > 0)) throw new Error("bondCashFlows: faceValue must be positive");
  if (couponRate < 0) throw new Error("bondCashFlows: couponRate cannot be negative");
  if (!(maturity > 0)) throw new Error("bondCashFlows: maturity must be positive");
  if (!Number.isInteger(frequency) || frequency < 1) {
    throw new Error("bondCashFlows: frequency must be a positive integer");
  }

  const periods = Math.round(maturity * frequency);
  const coupon = (faceValue * couponRate) / frequency;
  const flows: CashFlow[] = [];
  for (let k = 1; k <= periods; k++) {
    const time = maturity - (periods - k) / frequency;
    flows.push({ time, amount: k === periods ? coupon + faceValue : coupon });
  }
  return flows;
}

/**
 * Present value of a set of cash flows at a flat yield, using the bond-market
 * convention of compounding `frequency` times per year:
 *
 *   PV = sum over t of  CF_t / (1 + y/f)^(f*t)
 *
 * Note this is NOT continuous discounting. Using e^(-yt) instead would give a
 * slightly different price for the same quoted yield, which is a classic source
 * of disagreement between a model and a trading system.
 */
export function presentValue(flows: CashFlow[], yieldRate: number, frequency = 2): number {
  const periodRate = yieldRate / frequency;
  if (periodRate <= -1) throw new Error("presentValue: yield implies a non-positive discount factor");
  let pv = 0;
  for (const flow of flows) {
    pv += flow.amount / (1 + periodRate) ** (frequency * flow.time);
  }
  return pv;
}

/** Price a bond at a flat yield to maturity. */
export function bondPrice(bond: BondSpec, yieldRate: number): number {
  return presentValue(bondCashFlows(bond), yieldRate, bond.frequency);
}

/**
 * Yield to maturity: the single flat rate that makes the discounted cash flows
 * equal the observed price.
 *
 * Solved by bisection rather than Newton-Raphson. Price is strictly decreasing
 * in yield, so the root is unique and bracketed, and bisection cannot diverge.
 * Newton would converge faster but can overshoot badly for long-dated or
 * deep-discount bonds where the price-yield curve is highly convex.
 *
 * Returns null if the price lies outside the bracket — for instance a price
 * above the undiscounted sum of all cash flows, which implies a negative yield
 * beyond the search range.
 */
export function yieldToMaturity(
  bond: BondSpec,
  price: number,
  tolerance = 1e-10,
  maxIterations = 200,
): number | null {
  if (!(price > 0)) return null;
  let lo = -0.5;
  let hi = 2.0;

  const priceAt = (y: number) => bondPrice(bond, y);
  if (price > priceAt(lo) || price < priceAt(hi)) return null;

  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2;
    const diff = priceAt(mid) - price;
    if (Math.abs(diff) < tolerance) return mid;
    // Price falls as yield rises, so a price above target means yield is too low.
    if (diff > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface BondRiskMeasures {
  price: number;
  /** Macaulay duration, in years. */
  macaulayDuration: number;
  /** Modified duration: the percentage price sensitivity per unit of yield. */
  modifiedDuration: number;
  /** Convexity, the second-order term. */
  convexity: number;
  /** Dollar value of one basis point. */
  dv01: number;
  /** Weighted average time to cash flow, equal to Macaulay duration. */
  weightedAverageMaturity: number;
}

/**
 * Duration and convexity.
 *
 * MACAULAY DURATION is the present-value-weighted average time to receive the
 * cash flows:
 *
 *   D = ( sum of t * PV(CF_t) ) / P
 *
 * It has units of years and a genuinely physical interpretation: it is the
 * balance point of the cash flows on a time axis, with each flow weighted by
 * what it is worth today.
 *
 * MODIFIED DURATION rescales it into a price sensitivity:
 *
 *   D_mod = D / (1 + y/f),      dP/P ≈ -D_mod * dy
 *
 * The division by (1 + y/f) is the chain rule — differentiating
 * (1 + y/f)^(-ft) with respect to y brings down a factor of -t/(1 + y/f).
 *
 * CONVEXITY is the second derivative term:
 *
 *   C = ( sum of t*(t + 1/f) * PV(CF_t) ) / ( P * (1 + y/f)^2 )
 *
 * Duration alone is a straight-line approximation to a curved relationship. It
 * always UNDERSTATES the price for any yield change in either direction, because
 * the true price-yield curve is convex — which is why convexity is a desirable
 * property rather than merely a correction term.
 */
export function bondRiskMeasures(bond: BondSpec, yieldRate: number): BondRiskMeasures {
  const flows = bondCashFlows(bond);
  const f = bond.frequency;
  const periodRate = yieldRate / f;
  const price = presentValue(flows, yieldRate, f);
  if (price <= 0) {
    return {
      price, macaulayDuration: 0, modifiedDuration: 0, convexity: 0, dv01: 0,
      weightedAverageMaturity: 0,
    };
  }

  let weightedTime = 0;
  let convexitySum = 0;
  for (const flow of flows) {
    const pv = flow.amount / (1 + periodRate) ** (f * flow.time);
    weightedTime += flow.time * pv;
    // The (t + 1/f) factor comes from differentiating twice in the discretely
    // compounded convention.
    convexitySum += flow.time * (flow.time + 1 / f) * pv;
  }

  const macaulayDuration = weightedTime / price;
  const modifiedDuration = macaulayDuration / (1 + periodRate);
  const convexity = convexitySum / (price * (1 + periodRate) ** 2);

  return {
    price,
    macaulayDuration,
    modifiedDuration,
    convexity,
    // One basis point of yield, expressed in currency. Traders hedge in DV01.
    dv01: modifiedDuration * price * 1e-4,
    weightedAverageMaturity: macaulayDuration,
  };
}

/**
 * Second-order Taylor approximation to the price change for a yield move:
 *
 *   dP/P ≈ -D_mod * dy + (1/2) * C * dy^2
 *
 * Comparing this against the exact repriced value is the clearest way to see
 * what convexity buys you: the duration-only estimate is a tangent line, and it
 * sits below the true curve on both sides.
 */
export function approximatePriceChange(
  measures: BondRiskMeasures,
  yieldChange: number,
): { durationOnly: number; withConvexity: number } {
  const durationOnly = -measures.modifiedDuration * yieldChange;
  const withConvexity = durationOnly + 0.5 * measures.convexity * yieldChange * yieldChange;
  return { durationOnly, withConvexity };
}

/* ------------------------------------------------------------------ */
/* Yield curves                                                        */
/* ------------------------------------------------------------------ */

export type CurveShape = "normal" | "flat" | "inverted" | "humped";

export interface YieldCurvePoint {
  maturity: number;
  rate: number;
}

/**
 * Build a stylised zero-coupon yield curve.
 *
 * Uses the Nelson-Siegel functional form, which is the standard parametric
 * description of a yield curve and is what central banks publish:
 *
 *   y(t) = b0 + b1 * (1 - e^(-t/tau))/(t/tau) + b2 * [ (1 - e^(-t/tau))/(t/tau) - e^(-t/tau) ]
 *
 * The three coefficients have clean interpretations, which is why the form
 * survives: b0 is the long-run level, b1 is the short-end slope (the spread
 * between short and long rates, negated), and b2 controls the curvature or hump
 * in the middle. tau sets where that hump sits.
 */
export function nelsonSiegel(
  maturity: number,
  level: number,
  slope: number,
  curvature: number,
  tau = 2.5,
): number {
  // The limit as t -> 0 is level + slope; computing it directly would divide by zero.
  if (maturity <= 1e-9) return level + slope;
  const x = maturity / tau;
  const decay = (1 - Math.exp(-x)) / x;
  return level + slope * decay + curvature * (decay - Math.exp(-x));
}

export function buildYieldCurve(shape: CurveShape, maturities: number[]): YieldCurvePoint[] {
  const presets: Record<CurveShape, { level: number; slope: number; curvature: number }> = {
    // Upward sloping: long rates above short rates.
    normal: { level: 0.045, slope: -0.02, curvature: 0.01 },
    flat: { level: 0.04, slope: 0, curvature: 0 },
    // Inverted: short rates above long rates, historically a recession signal.
    inverted: { level: 0.035, slope: 0.025, curvature: -0.005 },
    humped: { level: 0.04, slope: -0.005, curvature: 0.03 },
  };
  const p = presets[shape];
  return maturities.map((m) => ({ maturity: m, rate: nelsonSiegel(m, p.level, p.slope, p.curvature) }));
}

/**
 * Implied forward rate between two maturities, from no-arbitrage.
 *
 * Investing to t2 directly must equal investing to t1 and rolling into the
 * forward, or there is a riskless profit:
 *
 *   (1 + y2)^t2 = (1 + y1)^t1 * (1 + f)^(t2 - t1)
 *
 * The forward rate is therefore not a forecast — it is the rate that makes the
 * two routes equivalent given today's curve. Treating it as the market's
 * prediction of future rates is a common and consequential misreading.
 */
export function forwardRate(y1: number, t1: number, y2: number, t2: number): number {
  if (t2 <= t1) throw new Error("forwardRate: t2 must exceed t1");
  const growthTo2 = (1 + y2) ** t2;
  const growthTo1 = (1 + y1) ** t1;
  return (growthTo2 / growthTo1) ** (1 / (t2 - t1)) - 1;
}

/** Price a bond off a full zero curve rather than a single flat yield. */
export function priceFromCurve(bond: BondSpec, curve: YieldCurvePoint[]): number {
  const flows = bondCashFlows(bond);
  let pv = 0;
  for (const flow of flows) {
    const rate = interpolateCurve(curve, flow.time);
    pv += flow.amount / (1 + rate) ** flow.time;
  }
  return pv;
}

/** Linear interpolation along the curve, flat beyond the endpoints. */
export function interpolateCurve(curve: YieldCurvePoint[], maturity: number): number {
  if (curve.length === 0) return 0;
  if (maturity <= curve[0].maturity) return curve[0].rate;
  const last = curve[curve.length - 1];
  if (maturity >= last.maturity) return last.rate;
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].maturity >= maturity) {
      const a = curve[i - 1];
      const b = curve[i];
      const w = (maturity - a.maturity) / (b.maturity - a.maturity);
      return a.rate + w * (b.rate - a.rate);
    }
  }
  return last.rate;
}
