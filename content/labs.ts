/**
 * The lab registry.
 *
 * Navigation, the homepage cards and the labs index all read from this one list,
 * so a lab can never appear in one place and be missing from another.
 */

export type Difficulty = 1 | 2 | 3 | 4;

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: "Level 1 · Foundations",
  2: "Level 2 · Mathematical modelling",
  3: "Level 3 · Quantitative research",
  4: "Level 4 · Advanced",
};

export const DIFFICULTY_SHORT: Record<Difficulty, string> = {
  1: "Foundations",
  2: "Modelling",
  3: "Research",
  4: "Advanced",
};

export interface LabMeta {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  difficulty: Difficulty;
  concepts: string[];
  minutes: number;
  category: "Probability & simulation" | "Portfolio & risk" | "Strategy research" | "Derivatives";
  status: "available" | "planned";
}

export const LABS: LabMeta[] = [
  {
    slug: "monte-carlo",
    title: "Monte Carlo Market Simulator",
    tagline: "Simulate thousands of possible futures under geometric Brownian motion.",
    description:
      "Build a distribution of outcomes instead of a single forecast. Control drift, volatility and horizon, then read the result as a probability distribution — and see exactly where the model's assumptions stop describing real markets.",
    difficulty: 2,
    concepts: ["Geometric Brownian motion", "Itô correction", "Log-normal distribution", "Percentiles", "Volatility drag"],
    minutes: 15,
    category: "Probability & simulation",
    status: "available",
  },
  {
    slug: "market-regimes",
    title: "Market Regime Simulator",
    tagline: "A hidden Markov market where the state you cannot see drives everything you can.",
    description:
      "Three hidden regimes with their own drift and volatility, switching according to a transition matrix you control. Hide the labels and try to infer the current state from observable data alone.",
    difficulty: 3,
    concepts: ["Markov chains", "Transition matrices", "Hidden states", "Regime persistence", "Volatility clustering"],
    minutes: 20,
    category: "Probability & simulation",
    status: "available",
  },
  {
    slug: "portfolio-optimizer",
    title: "Portfolio Optimizer",
    tagline: "Where diversification comes from, algebraically.",
    description:
      "Build a portfolio of synthetic assets, set their correlations, and watch the efficient frontier emerge from thousands of random portfolios. Includes the closed-form minimum-variance and maximum-Sharpe solutions.",
    difficulty: 2,
    concepts: ["Mean-variance optimisation", "Covariance matrices", "Efficient frontier", "Sharpe ratio", "Risk contribution"],
    minutes: 20,
    category: "Portfolio & risk",
    status: "available",
  },
  {
    slug: "risk-analyzer",
    title: "Risk Analyzer",
    tagline: "Six ways to measure risk, and what each one hides.",
    description:
      "Volatility, downside deviation, drawdown, VaR and CVaR computed three different ways on the same return series — so the disagreements between them become the lesson.",
    difficulty: 2,
    concepts: ["Value at Risk", "Conditional VaR", "Maximum drawdown", "Sortino ratio", "Fat tails"],
    minutes: 18,
    category: "Portfolio & risk",
    status: "available",
  },
  {
    slug: "backtesting",
    title: "Backtesting Lab",
    tagline: "Five strategies, and the transaction costs that quietly destroy them.",
    description:
      "Run moving-average, momentum, mean-reversion and random strategies against synthetic markets. Then turn on transaction costs and watch the edge evaporate.",
    difficulty: 3,
    concepts: ["Trading signals", "Transaction costs", "Turnover", "Equity curves", "Look-ahead bias"],
    minutes: 25,
    category: "Strategy research",
    status: "available",
  },
  {
    slug: "overfitting",
    title: "Overfitting Lab",
    tagline: "Optimise on the training set, then watch it fail out of sample.",
    description:
      "Search a parameter grid for the best in-sample Sharpe, then evaluate the winner on data it has never seen. The generalisation gap is the whole point.",
    difficulty: 3,
    concepts: ["Train/validation/test splits", "Generalisation gap", "Data snooping", "Multiple testing", "Selection bias"],
    minutes: 22,
    category: "Strategy research",
    status: "available",
  },
  {
    slug: "options",
    title: "Options Lab",
    tagline: "Black-Scholes, its Greeks, and a Monte Carlo price that converges to it.",
    description:
      "Price European options analytically and by simulation, compare the two, and watch the Monte Carlo error shrink as the square root of the sample size.",
    difficulty: 3,
    concepts: ["Black-Scholes", "Risk-neutral pricing", "Greeks", "Put-call parity", "Monte Carlo convergence"],
    minutes: 25,
    category: "Derivatives",
    status: "available",
  },
  {
    slug: "correlation",
    title: "Correlation Lab",
    tagline: "Drag one slider from -1 to +1 and watch diversification appear.",
    description:
      "Two assets, one correlation parameter, and a scatter plot that makes the covariance term in the portfolio variance formula visible.",
    difficulty: 1,
    concepts: ["Correlation", "Covariance", "Cholesky decomposition", "Diversification"],
    minutes: 12,
    category: "Portfolio & risk",
    status: "available",
  },
  {
    slug: "probability",
    title: "Probability Playground",
    tagline: "Coin flips, dice, Bayes, and the two limit theorems everything rests on.",
    description:
      "The law of large numbers and the central limit theorem, demonstrated by simulation rather than asserted. Start here if the rest of QuantLab assumes things you have not met yet.",
    difficulty: 1,
    concepts: ["Law of large numbers", "Central limit theorem", "Bayes' theorem", "Expected value", "Variance"],
    minutes: 15,
    category: "Probability & simulation",
    status: "available",
  },
  {
    slug: "random-walk",
    title: "Random Walk vs Market Structure",
    tagline: "Four data-generating processes that look alike and behave differently.",
    description:
      "Random walk, momentum, mean reversion and regime switching side by side, with the autocorrelation function that tells them apart.",
    difficulty: 2,
    concepts: ["AR(1) processes", "Autocorrelation", "Stationarity", "Momentum", "Mean reversion"],
    minutes: 18,
    category: "Probability & simulation",
    status: "available",
  },
];

export const LAB_CATEGORIES = [
  "Probability & simulation",
  "Portfolio & risk",
  "Derivatives",
  "Strategy research",
] as const;

export function getLab(slug: string): LabMeta | undefined {
  return LABS.find((lab) => lab.slug === slug);
}
