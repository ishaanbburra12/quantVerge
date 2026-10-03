/**
 * Structural credit risk: the Merton model.
 *
 * Every bond priced in the Fixed Income lab was assumed to pay in full. This
 * module drops that assumption, and the way it does so is one of the more
 * elegant arguments in finance.
 *
 * A firm funded by equity and a single zero-coupon debt issue of face value D
 * maturing at T has, at maturity, exactly two outcomes. If the firm is worth
 * more than D, the shareholders repay the debt and keep the difference. If it is
 * worth less, they hand over the firm and walk away — limited liability means
 * they cannot lose more than their stake.
 *
 * That payoff, max(V_T - D, 0), is a CALL OPTION on the firm's assets struck at
 * the face value of its debt. So equity can be priced with Black-Scholes, and
 * the debt is whatever is left over. Default probability, credit spread and
 * recovery all fall out of the same formula.
 */

import { normalCDF } from "@/lib/math/distributions";
import { blackScholes } from "@/lib/finance/blackScholes";

export interface MertonInputs {
  /** Market value of the firm's assets today. */
  assetValue: number;
  /** Face value of debt due at maturity. */
  debtFaceValue: number;
  /** Years until the debt matures. */
  maturity: number;
  /** Annualised volatility of the firm's asset value. */
  assetVolatility: number;
  /** Continuously-compounded risk-free rate. */
  riskFreeRate: number;
  /**
   * Real-world expected asset growth. Used ONLY for the real-world default
   * probability; the risk-neutral figures never touch it.
   */
  assetDrift?: number;
}

export interface MertonResult {
  /** Equity value, as a call on the firm's assets struck at the debt. */
  equityValue: number;
  /** Debt value today: firm value minus equity. */
  debtValue: number;
  /** What the debt would be worth if default were impossible. */
  riskFreeDebtValue: number;
  /**
   * Risk-neutral probability of default, N(-d2). This is what prices the debt;
   * it is NOT a forecast of how often the firm actually defaults.
   */
  riskNeutralDefaultProbability: number;
  /** Real-world default probability, using the actual expected growth. */
  realWorldDefaultProbability: number;
  /**
   * Distance to default: how many standard deviations of asset value separate
   * the firm from the default point. The single most used credit metric.
   */
  distanceToDefault: number;
  /** Annualised credit spread over the risk-free rate, in decimal form. */
  creditSpread: number;
  /** Expected fraction of face value recovered given default. */
  recoveryRate: number;
  /** Expected loss as a fraction of the debt's risk-free value. */
  expectedLoss: number;
  /** Leverage: debt face value discounted, over asset value. */
  leverage: number;
  d1: number;
  d2: number;
}

/**
 * Price a firm's equity and debt under Merton's structural model.
 *
 * Equity is a call: E = V*N(d1) - D*e^(-rT)*N(d2), identical in form to
 * Black-Scholes with the firm's assets as the underlying and the debt's face
 * value as the strike.
 *
 * The credit spread then follows from comparing the debt's actual value to what
 * it would be worth risk-free:
 *
 *   spread = -(1/T) * ln(debtValue / (D * e^(-rT)))
 *
 * A spread is therefore not a separate input to be estimated — it is implied by
 * leverage, asset volatility and time, which is the model's central claim.
 */
export function mertonModel(inputs: MertonInputs): MertonResult {
  const { assetValue, debtFaceValue, maturity, assetVolatility, riskFreeRate } = inputs;
  const drift = inputs.assetDrift ?? riskFreeRate;

  if (!(assetValue > 0)) throw new Error("mertonModel: assetValue must be positive");
  if (!(debtFaceValue > 0)) throw new Error("mertonModel: debtFaceValue must be positive");
  if (!(maturity > 0)) throw new Error("mertonModel: maturity must be positive");
  if (assetVolatility < 0) throw new Error("mertonModel: assetVolatility cannot be negative");

  // Equity as a call option on the firm's assets struck at the face value of
  // the debt. This is the whole idea.
  const option = blackScholes(
    {
      spot: assetValue,
      strike: debtFaceValue,
      timeToExpiry: maturity,
      riskFreeRate,
      volatility: assetVolatility,
    },
    "call",
  );

  const equityValue = option.price;
  // The firm's total value splits between the two claimants, so whatever the
  // equity is not worth, the debt is.
  const debtValue = assetValue - equityValue;
  const riskFreeDebtValue = debtFaceValue * Math.exp(-riskFreeRate * maturity);

  // N(-d2) is the risk-neutral probability the call expires worthless, which is
  // exactly the probability the firm's assets fall short of its debt.
  const riskNeutralDefaultProbability = normalCDF(-option.d2);

  // The real-world probability substitutes the true expected growth for r. The
  // two differ, often substantially, and conflating them is a standard error:
  // risk-neutral probabilities are inflated by the risk premium investors
  // demand, so they systematically exceed observed default rates.
  const sqrtT = Math.sqrt(maturity);
  const realWorldD2 =
    assetVolatility > 0 && maturity > 0
      ? (Math.log(assetValue / debtFaceValue) + (drift - (assetVolatility * assetVolatility) / 2) * maturity) /
        (assetVolatility * sqrtT)
      : assetValue >= debtFaceValue
        ? Infinity
        : -Infinity;
  const realWorldDefaultProbability = normalCDF(-realWorldD2);

  // Credit spread from the price difference, annualised.
  const creditSpread =
    debtValue > 0 && maturity > 0 ? -(1 / maturity) * Math.log(debtValue / riskFreeDebtValue) : 0;

  // Expected recovery given default. Conditional on the assets being worth less
  // than the debt, creditors receive the assets.
  const recoveryRate =
    riskNeutralDefaultProbability > 1e-12
      ? Math.min(
          1,
          (assetValue * Math.exp(riskFreeRate * maturity) * normalCDF(-option.d1)) /
            (debtFaceValue * riskNeutralDefaultProbability),
        )
      : 1;

  return {
    equityValue,
    debtValue,
    riskFreeDebtValue,
    riskNeutralDefaultProbability,
    realWorldDefaultProbability,
    // Distance to default, in standard deviations, under the real-world measure.
    distanceToDefault: realWorldD2,
    creditSpread,
    recoveryRate,
    expectedLoss: riskFreeDebtValue > 0 ? 1 - debtValue / riskFreeDebtValue : 0,
    leverage: riskFreeDebtValue / assetValue,
    d1: option.d1,
    d2: option.d2,
  };
}

/**
 * The credit spread implied across a range of maturities — the term structure.
 *
 * Merton produces a characteristic shape that is also its most cited failing:
 * as maturity goes to zero the spread goes to ZERO for any solvent firm,
 * because the assets cannot diffuse below the debt in no time at all. Real
 * short-dated credit spreads are emphatically not zero, which is the standard
 * evidence that firms default through jumps and surprises rather than through
 * a continuous drift downward.
 */
export function creditSpreadTermStructure(
  inputs: Omit<MertonInputs, "maturity">,
  maturities: number[],
): { maturity: number; spread: number; defaultProbability: number }[] {
  return maturities.map((maturity) => {
    const r = mertonModel({ ...inputs, maturity });
    return {
      maturity,
      spread: r.creditSpread,
      defaultProbability: r.riskNeutralDefaultProbability,
    };
  });
}

/**
 * Equity volatility implied by the model.
 *
 * Equity is a levered claim on the firm, so it is more volatile than the assets
 * underneath it:
 *
 *   sigma_E = (V / E) * N(d1) * sigma_V
 *
 * The ratio V*N(d1)/E is the elasticity of equity to asset value. This matters
 * in practice because asset value and asset volatility are NOT observable —
 * equity value and equity volatility are. Real implementations solve this
 * relation simultaneously with the pricing equation to back out the unobservable
 * inputs, which is what Moody's KMV built a business on.
 */
export function impliedEquityVolatility(inputs: MertonInputs): number {
  const result = mertonModel(inputs);
  if (result.equityValue <= 0) return 0;
  return (inputs.assetValue / result.equityValue) * normalCDF(result.d1) * inputs.assetVolatility;
}

/**
 * Expected loss on a portfolio of independent exposures, and the loss
 * distribution's tail, by direct binomial calculation.
 *
 * Independence is a deliberately unrealistic assumption here — it is the
 * baseline against which correlation's effect is measured. The whole lesson of
 * credit portfolio modelling is how badly independence understates tail risk.
 */
export function portfolioLossDistribution(
  exposures: number,
  defaultProbability: number,
  lossGivenDefault: number,
): { defaults: number; probability: number; lossFraction: number }[] {
  const out: { defaults: number; probability: number; lossFraction: number }[] = [];
  // Binomial probabilities via a stable recurrence, avoiding factorial overflow.
  let probability = (1 - defaultProbability) ** exposures;
  for (let k = 0; k <= exposures; k++) {
    out.push({
      defaults: k,
      probability,
      lossFraction: (k / exposures) * lossGivenDefault,
    });
    if (k < exposures) {
      probability *= ((exposures - k) / (k + 1)) * (defaultProbability / (1 - defaultProbability));
    }
  }
  return out;
}
