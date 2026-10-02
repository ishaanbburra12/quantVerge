/**
 * The experiment log.
 *
 * Every entry records an experiment actually run while building this platform —
 * including the ones that produced nothing, and the ones where the first attempt
 * was wrong. Failed experiments stay visible. A research record that only
 * contains successes is a sales document.
 */

export type ExperimentStatus = "Completed" | "Pilot" | "Failed" | "Needs revision";

export interface ExperimentEntry {
  id: string;
  date: string;
  status: ExperimentStatus;
  question: string;
  parameters: string;
  seed: string;
  result: string;
  interpretation: string;
}

export const EXPERIMENTS: ExperimentEntry[] = [
  {
    id: "EXP-001",
    date: "2026-09-30",
    status: "Completed",
    question: "Does the GBM generator reproduce the analytic result E[S_T] = S₀e^(μT), confirming the Itô correction is implemented correctly?",
    parameters: "S₀ = 100, μ = 0.08, σ = 0.20, T = 1, 252 steps, 60,000 paths",
    seed: "2024",
    result:
      "Observed mean terminal price within 1.5% of the analytic 108.33. Across ten independent seeds at 200,000 steps each, the mean log return had a pooled z-score of −1.07 against theory — no detectable bias.",
    interpretation:
      "The −σ²/2 term is correctly implemented. Without it the realised mean would be inflated by a factor of exp(σ²T/2) ≈ 1.02, which this test would detect at ~8 standard errors. Recorded as a regression test.",
  },
  {
    id: "EXP-002",
    date: "2026-09-30",
    status: "Completed",
    question: "Does the Black-Scholes implementation reproduce the canonical textbook values to six decimal places?",
    parameters: "S = K = 100, T = 1, r = 5%, σ = 20%",
    seed: "n/a — deterministic",
    result:
      "Call 10.450584, put 5.573526, d₁ = 0.35, d₂ = 0.15. Put-call parity residual below 1e-8 across five parameter sets. All Greeks matched central finite differences to six decimal places.",
    interpretation:
      "Correct. The finite-difference check initially failed at 3.2e-6 for delta, which traced to the single-precision error function in use at the time, not to the Greeks themselves.",
  },
  {
    id: "EXP-003",
    date: "2026-09-30",
    status: "Needs revision",
    question: "Is the normal CDF accurate enough for derivative-based quantities?",
    parameters: "Abramowitz-Stegun rational approximation, claimed accuracy ~1.2e-7",
    seed: "n/a — deterministic",
    result:
      "normalCDF(0) returned 0.49999998 rather than 0.5, an absolute error of 1.5e-8. Propagated into finite-difference Greek checks as an error of ~3e-6, because numerical differentiation amplifies input noise by 1/(2h).",
    interpretation:
      "Adequate for prices, not for anything downstream of them. Replaced with Hart's rational approximation, which reaches ~1e-15 and returns exactly 0.5 at zero. A reminder that 'accurate enough' depends entirely on what happens to the number next.",
  },
  {
    id: "EXP-004",
    date: "2026-09-30",
    status: "Failed",
    question: "Does parametric VaR understate tail risk relative to historical VaR on fat-tailed data?",
    parameters: "1,000 calm observations at ±0.1%, plus 10 crash observations between −20% and −45%. Confidence 99%.",
    seed: "n/a — constructed",
    result:
      "The comparison came out backwards: parametric VaR of 7.85% vastly EXCEEDED historical VaR of 0.30%.",
    interpretation:
      "The test construction was wrong, not the implementation. With exactly 1% contamination, the 99% quantile falls precisely at the boundary between the calm bulk and the crashes, so the historical estimate measured the bulk. Meanwhile the crashes inflated the standard deviation, pushing the parametric estimate up. Rebuilt as a 95/5 mixture of normals, where the contaminating fraction is comfortably larger than the tail probability being measured; the expected relationship then appeared clearly. Logged because the failure was instructive: a badly designed test can refute a true proposition.",
  },
  {
    id: "EXP-005",
    date: "2026-09-30",
    status: "Needs revision",
    question: "Does the regime-switching return process preserve the target annual volatility, so that comparisons across processes are controlled?",
    parameters: "Target σ = 20%, tail intensity 0.8, calm/turbulent regimes with persistence 0.985 / 0.94",
    seed: "42",
    result: "Realised volatility was 27.1% against a 20% target — a 36% overshoot.",
    interpretation:
      "The two regime volatilities were set as multiples of the target without accounting for the stationary mixture. Any comparison of risk metrics across processes would have confounded tail shape with scale, which would have invalidated the whole point of the Risk Analyzer. Fixed by deriving the stationary occupancy analytically and rescaling both regimes so the blended variance matches. The jump process needed the same correction.",
  },
  {
    id: "EXP-006",
    date: "2026-09-30",
    status: "Completed",
    question: "On a market with zero true autocorrelation, how large an in-sample Sharpe ratio does a parameter search produce, and does it survive out of sample?",
    parameters: "AR(1) with φ = 0, 3,780 days split 50/25/25, moving-average crossover grid, 0.05% transaction cost",
    seed: "42",
    result:
      "Best in-sample Sharpe 0.557 from the grid; the same parameters scored −0.890 on the held-out test period. The correlation between in-sample and out-of-sample Sharpe across the entire grid was −0.005.",
    interpretation:
      "Exactly what theory predicts when there is no signal: in-sample ranking carries no information about out-of-sample performance, and the correlation is indistinguishable from zero. The selected strategy's apparent edge is entirely the expected maximum of a set of noisy estimates of zero. This is the clearest single number on the site.",
  },
  {
    id: "EXP-007",
    date: "2026-09-30",
    status: "Completed",
    question: "Does an Oracle strategy that knows the hidden regime beat buy-and-hold on a regime-switching market?",
    parameters: "Three-regime market, 2,520 days, persistence 0.97 / 0.93 / 0.95, transaction cost 0.1%",
    seed: "42",
    result:
      "Oracle gross Sharpe 0.491 against buy-and-hold 0.447 — it wins before costs. Net of 0.1% costs, Oracle 0.389 against buy-and-hold 0.447 — it loses. The Oracle traded 93 times and surrendered 13.4% of total return to costs.",
    interpretation:
      "The environment contains genuine exploitable structure, but harvesting it costs more than it is worth at this cost level. An agent with perfect foresight about the hidden state cannot beat doing nothing. Any learned policy starts from strictly worse, since it must also estimate the state. Single seed; needs replication across seeds before being treated as a general property of the environment rather than of this path.",
  },
  {
    id: "EXP-008",
    date: "2026-09-30",
    status: "Completed",
    question: "Can a simple volatility-and-return threshold rule detect hidden market regimes better than always guessing the most common state?",
    parameters: "Three-regime market, 1,260 days, 40-day detection window, persistence 0.97 / 0.93 / 0.95",
    seed: "42",
    result:
      "Overall accuracy 41.6% against a 45.7% always-guess baseline — the detector is worse on accuracy. But recall on bear regimes was 50.7% against a base rate of roughly 23%, more than double chance.",
    interpretation:
      "Accuracy is the wrong metric for an imbalanced problem. The detector trades many correct majority-class guesses for fewer correct minority-class guesses, which is the right trade for the state anyone cares about identifying. Reported per-class recall alongside accuracy in the lab as a result. Confirms the broader point that volatility is estimable from short samples and drift is not.",
  },
  {
    id: "EXP-009",
    date: "2026-09-30",
    status: "Pilot",
    question: "Does the upper envelope of a random-portfolio cloud correctly approximate the efficient frontier under a no-short-selling constraint?",
    parameters: "Four assets, 4,000 random long-only portfolios, 50 volatility bands",
    seed: "424242",
    result:
      "The raw envelope rose, peaked, then fell at high volatility, producing a frontier curve that bent back on itself in the chart.",
    interpretation:
      "The descending tail consists of portfolios that are on the boundary of the feasible set but are dominated — another portfolio offers more return at less risk. They are not efficient and should not be drawn as the frontier. Fixed by trimming the envelope to its monotonically increasing portion, with tests asserting no envelope member dominates another. Marked pilot because the approximation quality as a function of sample size has not been characterised.",
  },
  {
    id: "EXP-010",
    date: "2026-09-30",
    status: "Needs revision",
    question: "Are all parameter combinations in the overfitting grid comparable across the three data splits?",
    parameters: "3,780 days split 50/25/25, slow moving-average windows up to 700 days",
    seed: "42",
    result:
      "Several combinations had slow windows longer than the shortest segment, so they generated no signal there, sat in cash, and scored a Sharpe of exactly 0. Against a field of losing strategies, 'never traded' won the best-on-test comparison.",
    interpretation:
      "A do-nothing result was being presented as the out-of-sample champion. Fixed by restricting the grid to combinations whose slow window leaves usable signal in the shortest segment. A good example of a bug that produces a plausible-looking number rather than an error.",
  },
];

export const STATUS_TONE: Record<ExperimentStatus, "positive" | "accent" | "negative" | "caution"> = {
  Completed: "positive",
  Pilot: "accent",
  Failed: "negative",
  "Needs revision": "caution",
};
