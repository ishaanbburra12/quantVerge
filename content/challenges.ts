/**
 * Original quantitative-thinking challenges.
 *
 * These are written for this site. They draw on standard results that appear in
 * any probability course — the expected waiting time for a pattern, the gambler's
 * ruin, the inspection paradox — rather than reproducing proprietary interview
 * question sets.
 */

export type ChallengeCategory = "Probability" | "Statistics" | "Algorithms" | "Market modelling" | "Logic" | "Optimisation";
export type Difficulty = "Beginner" | "Intermediate" | "Advanced";

export interface Challenge {
  id: string;
  title: string;
  category: ChallengeCategory;
  difficulty: Difficulty;
  problem: string;
  hints: string[];
  solution: string[];
  answer: string;
  simulation?: string;
}

export const CHALLENGES: Challenge[] = [
  {
    id: "CH-01",
    title: "Two heads in a row",
    category: "Probability",
    difficulty: "Intermediate",
    problem:
      "A fair coin is flipped repeatedly. What is the expected number of flips before two consecutive heads appear for the first time?",
    hints: [
      "Define states by how much progress you have made toward the goal: no heads yet, one head so far, done.",
      "Let E₀ be the expected additional flips from the 'no progress' state and E₁ from the 'one head' state.",
      "Every flip costs 1 and moves you to a new state with probability 1/2 each way.",
    ],
    solution: [
      "Let E₀ = expected flips from a state with no trailing head, E₁ = expected flips from a state with exactly one trailing head.",
      "From state 0: flip costs 1. With probability 1/2 you get a head and move to state 1; with probability 1/2 you get a tail and stay in state 0.",
      "E₀ = 1 + (1/2)E₁ + (1/2)E₀",
      "From state 1: flip costs 1. With probability 1/2 you get a head and finish; with probability 1/2 you get a tail and return to state 0.",
      "E₁ = 1 + (1/2)(0) + (1/2)E₀",
      "Substituting the second into the first: E₀ = 1 + (1/2)(1 + E₀/2) + E₀/2 = 1.5 + (3/4)E₀",
      "So (1/4)E₀ = 1.5, giving E₀ = 6.",
    ],
    answer:
      "6 flips. Note that two heads in a row is harder than it feels: the expected wait for a specific pair like HT is only 4, because a failed attempt at HT leaves you better positioned than a failed attempt at HH.",
    simulation:
      "Simulate 100,000 sequences, recording the flip count when HH first appears, and average. You should get 6.00 ± 0.02. Then try HT and confirm you get 4.",
  },
  {
    id: "CH-02",
    title: "The volatility drag",
    category: "Market modelling",
    difficulty: "Beginner",
    problem:
      "An investment gains 50% in year one and loses 50% in year two. The arithmetic average annual return is 0%. What is the actual total return, and what single constant annual rate would have produced the same outcome?",
    hints: [
      "Returns compound multiplicatively, not additively.",
      "Track a dollar through both years.",
      "The constant equivalent rate is the geometric mean.",
    ],
    solution: [
      "Start with $1. After year one: $1 × 1.50 = $1.50.",
      "After year two: $1.50 × 0.50 = $0.75.",
      "Total return = −25%.",
      "The geometric mean rate g satisfies (1 + g)² = 0.75, so 1 + g = √0.75 = 0.8660.",
      "g = −13.4% per year.",
    ],
    answer:
      "−25% total, equivalent to −13.4% per year. The arithmetic mean of 0% describes no outcome anybody experienced. The gap between arithmetic and geometric means is approximately σ²/2 — the same term that appears as the Itô correction in geometric Brownian motion.",
    simulation:
      "In the Monte Carlo lab, set μ to any value and raise σ. The mean ending price stays at S₀e^(μT) while the median falls. The gap is volatility drag.",
  },
  {
    id: "CH-03",
    title: "The best of many",
    category: "Statistics",
    difficulty: "Advanced",
    problem:
      "You test 1,000 trading strategies on data with no signal whatsoever. Each strategy's measured Sharpe ratio is an independent draw from N(0, 0.5²). What Sharpe ratio should you expect the best one to show, and what would you conclude if you saw only that one?",
    hints: [
      "The true Sharpe of every strategy is exactly zero. Any positive result is estimation error.",
      "You need the expected maximum of 1,000 normal draws.",
      "For standard normals, the expected maximum is approximately √(2 ln n).",
    ],
    solution: [
      "Every strategy has true Sharpe 0, so each measurement is pure noise with standard deviation 0.5.",
      "The expected maximum of n independent standard normals is approximately √(2 ln n).",
      "√(2 ln 1000) = √(2 × 6.908) = √13.82 = 3.72",
      "Scaling by the standard deviation: 3.72 × 0.5 = 1.86.",
    ],
    answer:
      "About 1.86 — a Sharpe ratio most people would consider excellent, produced entirely by selection on data containing no signal at all. Reported in isolation it looks like a discovery. The decisive missing information is how many strategies were tested, which is almost never disclosed.",
    simulation:
      "The Overfitting Lab does exactly this: set signal strength to zero, raise the search size, and watch the best in-sample Sharpe climb while out-of-sample performance does not follow.",
  },
  {
    id: "CH-04",
    title: "Zero-risk from two risky assets",
    category: "Optimisation",
    difficulty: "Intermediate",
    problem:
      "Asset A has 30% volatility, asset B has 20%, and their correlation is exactly −1. What weights produce a portfolio with zero volatility, and why does this not exist in practice?",
    hints: [
      "Write out the two-asset variance formula and substitute ρ = −1.",
      "The expression becomes a perfect square.",
      "Set it to zero and solve.",
    ],
    solution: [
      "σ²ₚ = w²σ₁² + (1−w)²σ₂² + 2w(1−w)ρσ₁σ₂",
      "With ρ = −1: σ²ₚ = w²σ₁² + (1−w)²σ₂² − 2w(1−w)σ₁σ₂",
      "This factors as a perfect square: σ²ₚ = (wσ₁ − (1−w)σ₂)²",
      "Setting it to zero: wσ₁ = (1−w)σ₂",
      "w = σ₂ / (σ₁ + σ₂) = 0.20 / 0.50 = 0.4",
    ],
    answer:
      "40% in A and 60% in B gives exactly zero volatility. It does not exist in practice because perfect negative correlation between real assets does not exist — and if it did, the combination would be a riskless asset that must earn the risk-free rate, or there would be an arbitrage. The mathematics still explains why low-correlation assets are so sought after.",
    simulation:
      "The Correlation Lab reproduces this: set ρ = −1 with equal volatilities and equal weights, and portfolio volatility reads exactly 0.00%.",
  },
  {
    id: "CH-05",
    title: "How long until you know?",
    category: "Statistics",
    difficulty: "Advanced",
    problem:
      "A strategy has a true Sharpe ratio of 0.5. How many years of data are needed before you could distinguish it from zero at 95% confidence?",
    hints: [
      "The standard error of an estimated Sharpe is approximately √((1 + S²/2) / n) with n years of data.",
      "For 95% confidence you need the estimate to exceed about 1.96 standard errors.",
      "Solve for n.",
    ],
    solution: [
      "SE ≈ √((1 + S²/2) / n) = √((1 + 0.125) / n) = √(1.125 / n)",
      "Require S / SE > 1.96, so 0.5 / √(1.125/n) > 1.96",
      "0.5√n / √1.125 > 1.96",
      "√n > 1.96 × 1.0607 / 0.5 = 4.158",
      "n > 17.3, so 18 whole years",
    ],
    answer:
      "Just over 17.3 years, so 18 full years. A genuinely good strategy needs nearly two decades of live performance before its edge is statistically distinguishable from luck. This is why track records are so hard to interpret, and why conviction in any strategy is almost always based on reasoning rather than on evidence.",
    simulation:
      "Run the Backtesting Lab at increasing horizons on a market with known structure and watch how much the measured Sharpe moves with the seed alone.",
  },
  {
    id: "CH-06",
    title: "The inspection paradox",
    category: "Probability",
    difficulty: "Advanced",
    problem:
      "Market regimes last 20 days on average. If you pick a random DAY and ask how long the regime containing that day lasts, is the answer 20 days?",
    hints: [
      "Long regimes contain more days than short ones.",
      "Picking a random day is not the same as picking a random regime.",
      "Think about the probability of landing inside a given regime.",
    ],
    solution: [
      "Picking a random day weights each regime by its length, since a 40-day regime contains twice as many days as a 20-day one.",
      "This is length-biased sampling: P(landing in a regime of length L) is proportional to L.",
      "For a geometric duration with mean m and variance v, the length-biased mean is m + v/m.",
      "A geometric distribution with mean 20 has variance of roughly m² = 400.",
      "So the expected length is about 20 + 400/20 = 40 days.",
    ],
    answer:
      "About 40 days, not 20. The regime you happen to be observing is systematically longer than average, because you are more likely to land inside a long one. The same effect makes your bus wait longer than half the average gap, and makes your class sizes larger than the school's average class size.",
    simulation:
      "In the Market Regime Simulator, record the length of every regime run, then separately record the run length containing each randomly chosen day. The two distributions differ substantially.",
  },
  {
    id: "CH-07",
    title: "Reconstructing a drawdown",
    category: "Algorithms",
    difficulty: "Intermediate",
    problem:
      "Given a sequence of portfolio values, find the maximum drawdown in a single pass. The sequence is 100, 50, 120, 200, 300, 280. What is the answer, and what is the common bug?",
    hints: [
      "Track the running maximum as you go.",
      "At each step, compute the decline from the running maximum, not from the global maximum.",
      "The worst drawdown here happens before the all-time high.",
    ],
    solution: [
      "Running peak after each value: 100, 100, 120, 200, 300, 300.",
      "Drawdown at each step: 0%, (50−100)/100 = −50%, 0%, 0%, 0%, (280−300)/300 = −6.7%",
      "Maximum drawdown = 50%, occurring from the peak of 100 down to 50.",
      "The common bug is reporting the peak as the series' global maximum, which here is 300 at index 4.",
      "That would wrongly identify the peak as occurring AFTER the trough — a chronological impossibility.",
    ],
    answer:
      "50%, from index 0 to index 1. The algorithm must record the peak that was in force at the moment the worst decline occurred, not the largest value in the whole series. This test case is in QuantLab's test suite precisely because the naive implementation passes every monotonic example and fails this one.",
    simulation: "The Risk Analyzer marks the responsible peak and trough on the equity curve.",
  },
  {
    id: "CH-08",
    title: "Which test result should worry you?",
    category: "Logic",
    difficulty: "Beginner",
    problem:
      "A screening test is 99% sensitive and 95% specific. The condition affects 1 in 1,000 people. You test positive. What is the probability you have the condition?",
    hints: [
      "Work with natural frequencies rather than probabilities — imagine 100,000 people.",
      "How many have the condition? How many of those test positive?",
      "How many are healthy? How many of those test positive anyway?",
    ],
    solution: [
      "Out of 100,000 people, 100 have the condition and 99,900 do not.",
      "Of the 100 with the condition, 99% test positive: 99 true positives.",
      "Of the 99,900 healthy people, 5% test positive anyway: 4,995 false positives.",
      "Total positives: 99 + 4,995 = 5,094.",
      "P(condition | positive) = 99 / 5,094 = 1.94%.",
    ],
    answer:
      "About 1.9%. Even with a highly accurate test, a positive result on a rare condition is usually a false alarm, because there are so many more healthy people that even a small false-positive rate swamps the true detections. Ignoring the base rate is one of the most robust errors in human reasoning — and it is the same structure as evaluating whether a backtest that 'passed' indicates a real strategy.",
    simulation: "The Bayes experiment in the Probability Playground computes this with natural frequencies.",
  },
  {
    id: "CH-09",
    title: "Why variance adds but volatility does not",
    category: "Probability",
    difficulty: "Beginner",
    problem:
      "Daily returns are independent with 1% standard deviation. What is the annual standard deviation over 252 trading days, and why is it not 252%?",
    hints: [
      "Variance of a sum of independent variables is the sum of the variances.",
      "Standard deviation is the square root of variance.",
      "The square root does not distribute over addition.",
    ],
    solution: [
      "Daily variance = (0.01)² = 0.0001",
      "Annual variance = 252 × 0.0001 = 0.0252 (variances add for independent variables)",
      "Annual standard deviation = √0.0252 = 0.1587 = 15.87%",
      "Equivalently: 1% × √252 = 1% × 15.87 = 15.87%",
    ],
    answer:
      "15.87%. Volatility scales with the square root of time because variance — not standard deviation — is what adds. The independence assumption is essential: with autocorrelated returns the rule fails, and real markets show enough volatility clustering that it is only approximately right.",
    simulation:
      "The Risk Analyzer annualises by √252 throughout. Set periodsPerYear to 1 to see the raw figure and confirm the ratio.",
  },
  {
    id: "CH-10",
    title: "The cost of being right too often",
    category: "Market modelling",
    difficulty: "Intermediate",
    problem:
      "Strategy A is right 55% of the time and trades daily. Strategy B is right 52% of the time and trades monthly. Both gain or lose 1% per correct or incorrect call. With 0.1% transaction costs per trade, which is better over a year?",
    hints: [
      "Compute the expected gross return per trade first.",
      "Then count how many trades each strategy makes in a year.",
      "Subtract total costs.",
    ],
    solution: [
      "Strategy A: expected gross per trade = 0.55(+1%) + 0.45(−1%) = +0.10%",
      "252 trades per year: gross = 25.2%. Costs = 252 × 0.1% = 25.2%. Net = 0.0%.",
      "Strategy B: expected gross per trade = 0.52(+1%) + 0.48(−1%) = +0.04%",
      "12 trades per year: gross = 0.48%. Costs = 12 × 0.1% = 1.2%. Net = −0.72%.",
      "Both lose after costs, but A's larger edge is entirely consumed by its frequency.",
    ],
    answer:
      "Neither works, which is the point. Strategy A has a much better hit rate and ends up exactly break-even; B is worse. Edge per trade must be compared against cost per trade, not against zero. A 55% hit rate sounds impressive and is worth precisely nothing at this cost level.",
    simulation: "The Backtesting Lab's cost-sensitivity table shows this effect across four cost levels.",
  },
];

export const CATEGORIES: ChallengeCategory[] = [
  "Probability", "Statistics", "Algorithms", "Market modelling", "Logic", "Optimisation",
];

export const DIFFICULTY_TONE: Record<Difficulty, "positive" | "caution" | "negative"> = {
  Beginner: "positive",
  Intermediate: "caution",
  Advanced: "negative",
};
