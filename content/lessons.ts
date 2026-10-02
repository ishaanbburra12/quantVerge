/**
 * The Learn section.
 *
 * Lessons are ordered by dependency, not by difficulty rating: each one assumes
 * only what came before it. The ordering follows the ten-module sequence, which
 * deliberately puts reinforcement learning last — it depends on everything else.
 */

export interface Lesson {
  slug: string;
  module: number;
  title: string;
  definition: string;
  intuition: string;
  formula?: string;
  formulaNote?: string;
  example: { prompt: string; working: string[]; answer: string };
  whyItMatters: string;
  demo?: { labSlug: string; label: string; query?: string };
  prerequisites: string[];
}

export interface Module {
  number: number;
  title: string;
  summary: string;
  lessons: string[];
}

export const MODULES: Module[] = [
  {
    number: 1,
    title: "Probability and returns",
    summary:
      "The vocabulary everything else is written in. Simple and log returns, expectation, variance, standard deviation, and why a random seed is a scientific instrument rather than a convenience.",
    lessons: ["simple-and-log-returns", "expected-value", "variance-and-standard-deviation", "normal-distribution", "random-seeds"],
  },
  {
    number: 2,
    title: "Monte Carlo simulation",
    summary:
      "Answering questions about distributions by generating them. Why it converges, how slowly, and what it can and cannot tell you.",
    lessons: ["monte-carlo-simulation", "law-of-large-numbers", "central-limit-theorem", "random-walks", "geometric-brownian-motion"],
  },
  {
    number: 3,
    title: "Correlation and covariance",
    summary: "How two series move together, and why that single number does most of the work in portfolio construction.",
    lessons: ["covariance", "correlation"],
  },
  {
    number: 4,
    title: "Portfolio mathematics",
    summary: "Linear returns, quadratic risk, and the free lunch that falls out of the difference.",
    lessons: ["portfolio-theory", "sharpe-ratio", "drawdown"],
  },
  {
    number: 5,
    title: "Time series",
    summary: "Memory, stationarity, and the diagnostics that distinguish structure from noise.",
    lessons: ["autocorrelation", "stationarity", "linear-regression"],
  },
  {
    number: 6,
    title: "Market regimes",
    summary: "Hidden states, Markov chains, and where fat tails and volatility clustering come from.",
    lessons: ["markov-chains", "market-regimes"],
  },
  {
    number: 7,
    title: "Backtesting",
    summary: "Simulating a strategy honestly, and the specific ways that goes wrong.",
    lessons: ["backtesting", "transaction-costs"],
  },
  {
    number: 8,
    title: "Overfitting and generalisation",
    summary: "Why searching harder makes results look better and be worse.",
    lessons: ["overfitting", "distribution-shift"],
  },
  {
    number: 9,
    title: "Machine learning",
    summary: "What a model is, what training means, and why the bias-variance trade-off governs everything.",
    lessons: ["machine-learning"],
  },
  {
    number: 10,
    title: "Reinforcement learning",
    summary: "States, actions, policies and rewards — and why reward design is the hard part.",
    lessons: ["reinforcement-learning"],
  },
];

export const LESSONS: Lesson[] = [
  {
    slug: "simple-and-log-returns",
    module: 1,
    title: "Simple and log returns",
    definition:
      "A simple return is the proportional change in price over one period. A log return is the natural logarithm of the price ratio over the same period.",
    intuition:
      "Both measure the same move, but they add up differently. Simple returns aggregate correctly across assets — a portfolio's return is the weighted average of its holdings' simple returns. Log returns aggregate correctly across time — the log return over a year is exactly the sum of the daily log returns. Neither does both, which is why you need both.",
    formula: "r_t = \\frac{P_t - P_{t-1}}{P_{t-1}} = \\frac{P_t}{P_{t-1}} - 1 \\qquad \\ell_t = \\ln\\!\\left(\\frac{P_t}{P_{t-1}}\\right)",
    formulaNote: "For small moves the two are nearly identical, since ln(1 + r) ≈ r. They diverge for large moves: a 50% loss is −0.69 in logs, and the +100% gain needed to recover it is +0.69.",
    example: {
      prompt: "A stock goes from $100 to $150, then back to $100. What are the returns?",
      working: [
        "Simple: +50%, then −33.3%. These do not sum to zero, and their average (+8.3%) is misleading.",
        "To combine them you must multiply growth factors: 1.5 × 0.667 = 1.0, so the total return is 0%.",
        "Log: ln(1.5) = +0.405, then ln(0.667) = −0.405.",
        "These DO sum to zero, which correctly reports that you ended where you started.",
      ],
      answer: "Log returns sum to exactly 0 over the round trip; simple returns do not sum at all and must be compounded.",
    },
    whyItMatters:
      "Choosing the wrong one silently corrupts results. Averaging simple returns over time overstates performance — the arithmetic mean always exceeds the geometric mean when returns vary, which is volatility drag. Summing log returns across assets in a portfolio is simply wrong.",
    demo: { labSlug: "monte-carlo", label: "See log returns drive the simulation" },
    prerequisites: [],
  },
  {
    slug: "expected-value",
    module: 1,
    title: "Expected value",
    definition: "The probability-weighted average of every possible outcome of a random variable.",
    intuition:
      "The long-run average if you could repeat the experiment forever. Crucially, it need not be an outcome you can actually observe: the expected value of one die roll is 3.5, which no die ever shows.",
    formula: "E[X] = \\sum_i x_i\\, P(X = x_i) \\qquad\\text{or}\\qquad E[X] = \\int_{-\\infty}^{\\infty} x f(x)\\,dx",
    formulaNote: "Expectation is linear: E[aX + bY] = aE[X] + bE[Y], for any X and Y, whether or not they are independent. That linearity is why portfolio expected return is a simple weighted average.",
    example: {
      prompt: "A bet pays $10 with probability 0.2 and loses $3 with probability 0.8. Should you take it?",
      working: [
        "E[X] = (0.2 × $10) + (0.8 × −$3)",
        "= $2.00 − $2.40",
        "= −$0.40",
      ],
      answer: "The expected value is −$0.40, so repeated play loses money — even though the headline payoff of $10 is attractive.",
    },
    whyItMatters:
      "Expected value is the foundation of every pricing argument in finance. The price of a derivative is an expected value under a particular probability measure. But expectation alone is dangerously incomplete: it says nothing about spread, and a strategy with positive expected value can still ruin you if the path to that average passes through zero.",
    demo: { labSlug: "probability", label: "Watch expectation emerge from repetition", query: "experiment=lln" },
    prerequisites: [],
  },
  {
    slug: "variance-and-standard-deviation",
    module: 1,
    title: "Variance and standard deviation",
    definition:
      "Variance is the expected squared deviation from the mean. Standard deviation is its square root, which restores the original units.",
    intuition:
      "A measure of spread. Squaring makes deviations in both directions count and penalises large deviations disproportionately — one observation twice as far from the mean contributes four times as much. The square root then converts back into interpretable units: a standard deviation of 20% is a percentage, while a variance of 0.04 is a percentage squared.",
    formula: "\\operatorname{Var}(X) = E\\left[(X - \\mu)^2\\right] = E[X^2] - \\mu^2 \\qquad \\sigma = \\sqrt{\\operatorname{Var}(X)}",
    formulaNote:
      "For a SAMPLE, divide by (n − 1) rather than n. This is Bessel's correction: deviations are measured from the sample mean, which sits closer to your own data than the true mean does, so dividing by n systematically understates the spread.",
    example: {
      prompt: "Returns of 10%, −5%, 15%, 0%. What is the sample standard deviation?",
      working: [
        "Mean = (10 − 5 + 15 + 0) / 4 = 5%",
        "Deviations: +5, −10, +10, −5",
        "Squared: 25, 100, 100, 25 → sum = 250",
        "Sample variance = 250 / (4 − 1) = 83.33",
        "Standard deviation = √83.33 = 9.13%",
      ],
      answer: "9.13%. Using n instead of n−1 would give 7.91%, which understates the spread.",
    },
    whyItMatters:
      "Volatility — the annualised standard deviation of returns — is the default risk measure in finance, and it is the denominator of the Sharpe ratio. It is also deeply limited: it treats gains and losses identically, and it is finite even for distributions whose tails are catastrophic.",
    demo: { labSlug: "risk-analyzer", label: "Compare volatility against five other risk measures" },
    prerequisites: ["expected-value"],
  },
  {
    slug: "normal-distribution",
    module: 1,
    title: "The normal distribution",
    definition:
      "A continuous, symmetric, bell-shaped distribution completely described by two numbers: its mean and its standard deviation.",
    intuition:
      "The shape you get when many small independent effects add together. About 68% of draws fall within one standard deviation of the mean, 95% within two, and 99.7% within three.",
    formula: "f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}",
    formulaNote:
      "The tails decay like e^(−x²/2), which is extraordinarily fast. That is the source of the model's most consequential failure: it makes extreme events far rarer than they are in real markets.",
    example: {
      prompt: "Daily returns have mean 0 and standard deviation 1%. How often should a −5% day occur?",
      working: [
        "−5% is 5 standard deviations below the mean.",
        "P(Z < −5) ≈ 2.87 × 10⁻⁷",
        "That is about 1 day in 3.5 million, or roughly once every 14,000 years of trading.",
      ],
      answer: "The normal model says essentially never. Real equity markets deliver 5σ days every few years — which is the clearest evidence that returns are not normal.",
    },
    whyItMatters:
      "It is the default assumption almost everywhere in finance, because it is mathematically tractable and because the central limit theorem justifies it for averages. Knowing precisely where it fails — in the tails — is more valuable than knowing where it works.",
    demo: { labSlug: "probability", label: "Build a normal distribution from non-normal parts", query: "experiment=clt" },
    prerequisites: ["variance-and-standard-deviation"],
  },
  {
    slug: "random-seeds",
    module: 1,
    title: "Random seeds and reproducibility",
    definition:
      "A seed is the starting state of a pseudo-random number generator. The same seed produces exactly the same sequence of numbers every time.",
    intuition:
      "Computer randomness is not random — it is a deterministic sequence that passes statistical tests for randomness. The seed selects which sequence you get. This is a feature, not a limitation: it makes simulated experiments repeatable in a way physical experiments can only aspire to.",
    formulaNote:
      "Every generator in QuantLab takes an explicit seed, and every lab exposes it. Nothing on this site produces a number that cannot be regenerated.",
    example: {
      prompt: "Why should you rerun an experiment with several different seeds?",
      working: [
        "One seed gives one sample path — one draw from the process.",
        "Any conclusion you reach might be a property of that particular draw rather than of the process.",
        "Changing the seed changes nothing about the model, only the luck.",
        "If a conclusion disappears when the seed changes, it was never a conclusion.",
      ],
      answer: "Seed variation is the cheapest and most effective robustness check available in simulation work.",
    },
    whyItMatters:
      "Reproducibility separates an experiment from an anecdote. A result nobody else can regenerate cannot be checked, and a result you cannot regenerate yourself cannot be debugged. It is also the first thing a reviewer will ask for.",
    demo: { labSlug: "backtesting", label: "Change one seed and watch every conclusion move" },
    prerequisites: [],
  },
  {
    slug: "monte-carlo-simulation",
    module: 2,
    title: "Monte Carlo simulation",
    definition:
      "Estimating a quantity by generating many random samples and averaging, rather than by solving for it analytically.",
    intuition:
      "If you cannot compute an integral, sample from it instead. The method works because of the law of large numbers: the sample average converges to the true expectation. Its value is that it works on problems with no closed form — which is most interesting problems.",
    formula: "E[f(X)] \\approx \\frac{1}{N}\\sum_{i=1}^{N} f(X_i) \\qquad \\text{SE} = \\frac{\\sigma_f}{\\sqrt{N}}",
    formulaNote:
      "The error shrinks as 1/√N. This is the method's defining limitation: halving the error requires four times the samples, and one more decimal place requires a hundred times.",
    example: {
      prompt: "You need an option price accurate to one cent. The payoff standard deviation is $14. How many simulations?",
      working: [
        "Standard error must be below $0.01 (roughly; a confidence interval would need more).",
        "SE = 14 / √N < 0.01",
        "√N > 1400",
        "N > 1,960,000",
      ],
      answer: "About two million simulations — for a price Black-Scholes computes exactly and instantly. Monte Carlo earns its keep only when no closed form exists.",
    },
    whyItMatters:
      "It is the workhorse for anything path-dependent, high-dimensional or analytically intractable: exotic options, risk aggregation, scenario analysis. It also produces a full distribution rather than a point estimate, which is often what you actually wanted.",
    demo: { labSlug: "monte-carlo", label: "Run a Monte Carlo simulation" },
    prerequisites: ["expected-value", "random-seeds"],
  },
  {
    slug: "law-of-large-numbers",
    module: 2,
    title: "The law of large numbers",
    definition: "The sample mean of independent draws converges to the true expected value as the number of draws grows.",
    intuition:
      "Averages stabilise. Early observations swing the average around; later ones barely move it, because each new observation is one of an ever-growing number. The convergence comes from dilution, not from correction.",
    formula: "\\bar{X}_n = \\frac{1}{n}\\sum_{i=1}^{n} X_i \;\\xrightarrow{\;n\\to\\infty\;}\; \\mu",
    example: {
      prompt: "After 10 flips of a fair coin you have 7 heads. Are tails now 'due'?",
      working: [
        "No. The coin has no memory; the next flip is still 50/50.",
        "The proportion converges because the denominator grows, not because the imbalance is repaid.",
        "In fact the ABSOLUTE difference between heads and tails typically grows, roughly like √n.",
        "After 10,000 flips you might be 50 heads ahead — a larger gap, but only 0.5% of the total.",
      ],
      answer: "The proportion converges to 0.5 while the raw count difference typically grows. Believing otherwise is the gambler's fallacy.",
    },
    whyItMatters:
      "It is the reason simulation works at all, and the reason a long track record is more informative than a short one. It is also routinely misapplied: it says nothing about any individual outcome, and 'the long run' can be far longer than any investor's horizon.",
    demo: { labSlug: "probability", label: "Watch a proportion converge", query: "experiment=lln" },
    prerequisites: ["expected-value"],
  },
  {
    slug: "central-limit-theorem",
    module: 2,
    title: "The central limit theorem",
    definition:
      "The standardised sample mean of independent, finite-variance random variables converges to a standard normal distribution, whatever the shape of the original distribution.",
    intuition:
      "Averaging destroys shape information. Whether you start with a flat, skewed, or two-point distribution, the distribution of the average becomes bell-shaped. This is why the normal distribution appears so often — not because nature prefers it, but because sums and averages are everywhere.",
    formula: "\\sqrt{n}\\,\\frac{\\bar{X}_n - \\mu}{\\sigma} \;\\xrightarrow{d}\; N(0,1)",
    formulaNote:
      "The √n factor is essential. Without it the distribution of the mean collapses to a spike at μ; with it, the spread is held constant and the SHAPE's convergence becomes visible.",
    example: {
      prompt: "Daily returns are heavily skewed. Are monthly returns?",
      working: [
        "A monthly log return is the sum of about 21 daily log returns.",
        "The CLT says the sum of many independent draws tends toward normal.",
        "Skewness of a sum shrinks like 1/√n, so monthly skew should be about 1/√21 ≈ 22% of daily skew.",
        "But the CLT requires independence, and returns exhibit volatility clustering, which violates it.",
      ],
      answer: "Monthly returns are closer to normal than daily returns, but real dependence means the convergence is slower than the theorem promises.",
    },
    whyItMatters:
      "It justifies the normal approximations used throughout finance, including the confidence intervals on every Monte Carlo estimate. Its conditions — independence and finite variance — are exactly the conditions markets violate, and knowing that tells you when to distrust the approximation.",
    demo: { labSlug: "probability", label: "Build a bell curve from a skewed distribution", query: "experiment=clt" },
    prerequisites: ["law-of-large-numbers", "normal-distribution"],
  },
  {
    slug: "random-walks",
    module: 2,
    title: "Random walks",
    definition: "A process whose next value is the current value plus an independent random step.",
    intuition:
      "Each step is unrelated to the last, so the best forecast of tomorrow's price is today's price. The path looks purposeful in hindsight — you will see trends, support levels and reversals in a series you know has none — which is the single most important thing to internalise about them.",
    formula: "P_t = P_{t-1} + \\varepsilon_t, \\qquad \\varepsilon_t \;\\text{independent, mean } 0",
    formulaNote:
      "Variance grows linearly with time, so standard deviation grows with √t. This is where the square-root-of-time rule for scaling volatility comes from, and it holds only because the steps are independent.",
    example: {
      prompt: "A random walk starts at 100 with daily standard deviation 1%. What is the one-year spread?",
      working: [
        "Daily variance = 0.01² = 0.0001",
        "Annual variance = 252 × 0.0001 = 0.0252",
        "Annual standard deviation = √0.0252 = 15.9%",
        "Note: 252 × 1% = 252% would be badly wrong. Volatility scales with √t, not t.",
      ],
      answer: "About 15.9% — because variances add over time, not standard deviations.",
    },
    whyItMatters:
      "It is the null hypothesis for every claim that a market is predictable. Before believing a pattern is real, you should check that it does not appear just as readily in a random walk — which the Backtesting Lab lets you do directly.",
    demo: { labSlug: "random-walk", label: "Compare a random walk against processes with memory" },
    prerequisites: ["variance-and-standard-deviation"],
  },
  {
    slug: "geometric-brownian-motion",
    module: 2,
    title: "Geometric Brownian motion",
    definition:
      "A continuous-time process in which the proportional change in a quantity is a random walk, so the quantity itself is log-normally distributed.",
    intuition:
      "A random walk in percentage terms rather than in dollars. Scaling the step size by the current price is what keeps prices positive and makes a $500 stock move in bigger dollar steps than a $5 one while moving in the same percentage steps.",
    formula: "dS = \\mu S\\,dt + \\sigma S\\,dW \\qquad\\Longrightarrow\\qquad S_T = S_0\\exp\\!\\left[\\left(\\mu - \\tfrac{\\sigma^2}{2}\\right)T + \\sigma\\sqrt{T}\\,Z\\right]",
    formulaNote:
      "The −σ²/2 term is the Itô correction. Because the exponential is convex, E[eˣ] > e^E[ˣ]; without that subtraction, volatility alone would manufacture free expected growth.",
    example: {
      prompt: "With μ = 8% and σ = 40%, how do the mean and median one-year outcomes differ?",
      working: [
        "Mean grows at μ: E[S₁] = S₀ × e^0.08 = 1.083 × S₀",
        "Median grows at μ − σ²/2 = 0.08 − 0.08 = 0",
        "Median = S₀ × e⁰ = S₀",
      ],
      answer: "The average outcome is +8.3% while the typical outcome is exactly 0%. The mean is dragged up by a thin tail of very large outcomes.",
    },
    whyItMatters:
      "It is the model underneath Black-Scholes and most of derivatives pricing. Its failures — constant volatility, no jumps, thin tails — are the starting point for nearly every more sophisticated model.",
    demo: { labSlug: "monte-carlo", label: "Simulate GBM and check the Itô correction" },
    prerequisites: ["random-walks", "simple-and-log-returns"],
  },
  {
    slug: "covariance",
    module: 3,
    title: "Covariance",
    definition: "The expected product of two variables' deviations from their respective means.",
    intuition:
      "It asks: when X is above its mean, does Y tend to be above its mean too? Positive covariance means they move together, negative means they move oppositely. Its magnitude is hard to interpret because its units are the product of both variables' units.",
    formula: "\\operatorname{Cov}(X, Y) = E\\left[(X - \\mu_X)(Y - \\mu_Y)\\right]",
    formulaNote: "Cov(X, X) = Var(X), so variance is just covariance with itself. That is why the diagonal of a covariance matrix holds the variances.",
    example: {
      prompt: "Why is covariance hard to interpret directly?",
      working: [
        "If X and Y are both returns in percent, Cov is in percent-squared.",
        "A covariance of 0.012 tells you the sign but not the strength.",
        "Rescaling X from decimals to percent multiplies the covariance by 100 without changing the relationship at all.",
        "Dividing by both standard deviations removes the units and bounds the result to [−1, 1].",
      ],
      answer: "Covariance carries the right information in unusable units. Correlation is covariance made interpretable.",
    },
    whyItMatters:
      "The covariance matrix is the object every portfolio optimiser consumes. Portfolio variance is a quadratic form in it, and for a portfolio of n assets there are n(n−1) covariance terms against only n variance terms — so co-movement, not individual volatility, dominates risk.",
    demo: { labSlug: "portfolio-optimizer", label: "Inspect a covariance matrix" },
    prerequisites: ["variance-and-standard-deviation"],
  },
  {
    slug: "correlation",
    module: 3,
    title: "Correlation",
    definition: "Covariance divided by the product of both standard deviations, producing a dimensionless number between −1 and +1.",
    intuition:
      "The strength and direction of a linear relationship, on a fixed scale. +1 is perfect positive linear dependence, −1 perfect negative, 0 no linear relationship. Think of it as the tilt of a scatter plot.",
    formula: "\\rho_{XY} = \\frac{\\operatorname{Cov}(X,Y)}{\\sigma_X \\sigma_Y}",
    formulaNote:
      "It measures LINEAR association only. If Y = X² with X symmetric about zero, the correlation is exactly zero while Y is completely determined by X.",
    example: {
      prompt: "Two assets each have 20% volatility and correlation 0. What is the volatility of a 50/50 portfolio?",
      working: [
        "σ²ₚ = 0.5² × 0.2² + 0.5² × 0.2² + 2 × 0.5 × 0.5 × 0 × 0.2 × 0.2",
        "= 0.01 + 0.01 + 0",
        "= 0.02",
        "σₚ = √0.02 = 14.14%",
      ],
      answer: "14.14%, down from 20% — a 29% reduction in risk at no cost in expected return, purely from the cross term vanishing.",
    },
    whyItMatters:
      "Diversification is entirely a statement about correlation. The most important practical caveat is that correlations are unstable and tend to rise toward 1 in crises, so the benefit measured in calm markets partly evaporates when it is most needed.",
    demo: { labSlug: "correlation", label: "Drag the correlation slider" },
    prerequisites: ["covariance"],
  },
  {
    slug: "portfolio-theory",
    module: 4,
    title: "Portfolio theory",
    definition:
      "The framework for choosing portfolio weights to minimise variance for a given expected return, or maximise expected return for a given variance.",
    intuition:
      "An asset should be judged by what it does to the portfolio you already hold, not by its own characteristics. A volatile asset that moves opposite to everything else can reduce total risk.",
    formula: "E(R_p) = \\mathbf{w}^{\\top}\\boldsymbol{\\mu} \\qquad \\sigma_p^2 = \\mathbf{w}^{\\top}\\boldsymbol{\\Sigma}\\mathbf{w}",
    formulaNote:
      "Return is LINEAR in the weights; risk is QUADRATIC. That asymmetry is the whole source of diversification — you can rearrange risk without rearranging expected return.",
    example: {
      prompt: "Why does the efficient frontier curve rather than run straight?",
      working: [
        "At ρ = +1 the portfolio volatility is the weighted average of the two volatilities — a straight line.",
        "At ρ < 1 the cross term is smaller, so actual volatility falls below that line.",
        "The shortfall is largest at intermediate weights, where both assets contribute.",
        "That bowing-inward is exactly the diversification benefit, drawn.",
      ],
      answer: "The curvature IS the diversification benefit. A straight frontier would mean correlation of exactly +1 and no benefit at all.",
    },
    whyItMatters:
      "It is the foundation of institutional asset allocation. Its practical weakness is severe: it inverts an estimated covariance matrix, and inversion amplifies estimation error, so naive optimisers are sometimes called error maximisers.",
    demo: { labSlug: "portfolio-optimizer", label: "Build an efficient frontier" },
    prerequisites: ["correlation", "expected-value"],
  },
  {
    slug: "sharpe-ratio",
    module: 4,
    title: "The Sharpe ratio",
    definition: "Excess return over the risk-free rate, divided by the standard deviation of returns.",
    intuition: "Return per unit of risk. It allows comparison between strategies of different sizes, since leverage scales numerator and denominator equally.",
    formula: "S = \\frac{E[R_p] - r_f}{\\sigma_p}",
    formulaNote:
      "Annualise by multiplying a per-period Sharpe by √(periods per year) — valid only if returns are independent, which is the same assumption that underlies the square-root-of-time rule.",
    example: {
      prompt: "A one-year backtest reports a Sharpe of 1.0. How confident should you be?",
      working: [
        "The standard error of a Sharpe estimate is roughly √((1 + S²/2)/n) with n years of data.",
        "With n = 1 and S = 1: SE ≈ √(1.5) ≈ 1.22",
        "A 95% confidence interval is therefore roughly −1.4 to +3.4.",
        "The interval comfortably includes zero.",
      ],
      answer: "Not confident at all. A one-year Sharpe of 1.0 is statistically indistinguishable from no skill whatsoever.",
    },
    whyItMatters:
      "It is the industry's default performance metric, which makes understanding its weaknesses essential: it penalises upside volatility, assumes roughly normal returns, and flatters strategies that sell insurance and blow up rarely.",
    demo: { labSlug: "risk-analyzer", label: "Compare Sharpe against Sortino and Calmar" },
    prerequisites: ["variance-and-standard-deviation", "expected-value"],
  },
  {
    slug: "drawdown",
    module: 4,
    title: "Drawdown",
    definition: "The percentage decline from a portfolio's running maximum to its subsequent low point.",
    intuition:
      "How far underwater you are relative to your best moment. Unlike volatility, it depends on the ORDER of returns — which is exactly why it captures the lived experience of losing money that volatility misses.",
    formula: "D_t = \\frac{V_t - \\max_{s \\le t} V_s}{\\max_{s \\le t} V_s}",
    formulaNote:
      "Maximum drawdown is the most negative value this takes. It can only grow as a track record lengthens, so comparing drawdowns across different sample lengths is not meaningful.",
    example: {
      prompt: "A portfolio goes 100 → 150 → 90 → 200. What is the maximum drawdown?",
      working: [
        "Running peak: 100, 150, 150, 200",
        "Drawdown at each step: 0%, 0%, (90−150)/150 = −40%, 0%",
        "The worst is −40%, from the peak of 150 down to 90.",
        "Note the peak that matters is 150, not the all-time high of 200 reached later.",
      ],
      answer: "40%. Identifying the correct peak — the one in force at the time — is where naive implementations go wrong.",
    },
    whyItMatters:
      "Drawdown determines whether a strategy is survivable in practice. Investors redeem and traders are shut down during drawdowns, so a strategy with excellent long-run statistics and a 60% drawdown may never reach the long run.",
    demo: { labSlug: "risk-analyzer", label: "See the peak and trough identified on an equity curve" },
    prerequisites: ["simple-and-log-returns"],
  },
  {
    slug: "autocorrelation",
    module: 5,
    title: "Autocorrelation",
    definition: "The correlation of a series with a time-shifted copy of itself.",
    intuition:
      "Does the past predict the future, linearly? Positive lag-1 autocorrelation means up days tend to follow up days (momentum); negative means they tend to reverse (mean reversion); zero means no linear memory.",
    formula: "\\rho_k = \\frac{\\sum_{t=k+1}^{n}(r_t - \\bar{r})(r_{t-k} - \\bar{r})}{\\sum_{t=1}^{n}(r_t - \\bar{r})^2}",
    formulaNote:
      "Under the null hypothesis of no autocorrelation, each estimate has standard error about 1/√n, so values inside ±1.96/√n are indistinguishable from noise.",
    example: {
      prompt: "You test 20 lags and two fall outside the 95% band. Is that evidence of structure?",
      working: [
        "A 95% band means each individual lag has a 5% chance of falling outside by luck alone.",
        "Across 20 lags, the expected number of false positives is 20 × 0.05 = 1.",
        "Observing 2 is entirely unremarkable.",
        "This is multiple testing — the same issue as searching many strategy parameters.",
      ],
      answer: "No. With 20 tests you should expect about one exceedance by chance; two is well within normal variation.",
    },
    whyItMatters:
      "It is the primary diagnostic for predictability. The autocorrelation of SQUARED returns is even more important: it is usually strongly positive even when return autocorrelation is zero, which is volatility clustering — the most robust empirical fact in finance.",
    demo: { labSlug: "random-walk", label: "Compare return and squared-return autocorrelation" },
    prerequisites: ["correlation"],
  },
  {
    slug: "stationarity",
    module: 5,
    title: "Stationarity",
    definition: "A series is stationary if its statistical properties — mean, variance, autocorrelation — do not depend on when you observe it.",
    intuition:
      "A stationary series looks statistically the same in every window. A non-stationary one does not, so a model fitted to one period can be badly wrong in another.",
    formulaNote:
      "Prices are not stationary: they wander with no fixed mean. Returns usually are, approximately. This is why finance works with returns rather than price levels — differencing is the standard route from non-stationary to stationary.",
    example: {
      prompt: "Why can you not just run a regression on raw price levels?",
      working: [
        "Two unrelated non-stationary series will often appear strongly correlated.",
        "This is spurious regression: both trend over time, so they appear related even with no causal link.",
        "The test statistics are invalid because the standard assumptions are violated.",
        "Differencing to returns removes the trend and restores approximate stationarity.",
      ],
      answer: "Regressing non-stationary series on each other produces impressive, meaningless results. Work with returns instead.",
    },
    whyItMatters:
      "Nearly every statistical tool assumes stationarity. Markets are at best locally stationary — regimes change — which is the deepest reason backtested performance degrades out of sample.",
    demo: { labSlug: "market-regimes", label: "See a non-stationary market" },
    prerequisites: ["autocorrelation"],
  },
  {
    slug: "linear-regression",
    module: 5,
    title: "Linear regression",
    definition: "Fitting a straight line through data by minimising the sum of squared vertical distances between the line and the observations.",
    intuition:
      "Find the line that best explains one variable using another. The slope says how much y moves per unit of x; R² says how much of y's variation the line accounts for.",
    formula: "y = \\alpha + \\beta x + \\varepsilon, \\qquad \\hat{\\beta} = \\frac{\\operatorname{Cov}(x, y)}{\\operatorname{Var}(x)}",
    formulaNote:
      "Note that β is literally the covariance divided by the variance of the predictor — the same quantity as a stock's beta against the market.",
    example: {
      prompt: "A stock's regression against the market gives β = 1.3 and R² = 0.6. What does that mean?",
      working: [
        "β = 1.3: when the market moves 1%, the stock moves 1.3% on average.",
        "R² = 0.6: about 60% of the stock's variance is explained by market moves.",
        "The remaining 40% is idiosyncratic — specific to this company.",
        "α, the intercept, is the average return not explained by the market.",
      ],
      answer: "The stock is 30% more sensitive than the market, and 40% of its movement is unrelated to the market.",
    },
    whyItMatters:
      "Regression underlies CAPM, factor models and most of empirical finance. Its central danger is that a fitted line always exists, even when no relationship does — which is overfitting in its simplest possible form.",
    prerequisites: ["correlation"],
  },
  {
    slug: "markov-chains",
    module: 6,
    title: "Markov chains",
    definition: "A process that moves between a finite set of states, where the next state depends only on the current state.",
    intuition:
      "The current state contains everything relevant about the past. A transition matrix gives the probability of moving from each state to each other state, and the diagonal entries control how persistent each state is.",
    formula: "P(s_{t+1} = j \\mid s_t = i, s_{t-1}, \\ldots) = P(s_{t+1} = j \\mid s_t = i) = P_{ij}",
    formulaNote:
      "Run length in a state is geometrically distributed, so the expected duration is 1/(1 − Pᵢᵢ). At Pᵢᵢ = 0.98 that is 50 periods; at 0.5 it is 2.",
    example: {
      prompt: "P(bull → bull) = 0.98. How long does a bull market last, and why does it matter?",
      working: [
        "Expected duration = 1 / (1 − 0.98) = 50 periods.",
        "At 0.90 it would be 10 periods; at 0.50, only 2.",
        "A 40-day rolling statistic cannot detect a state that lasts 2 days.",
        "Persistence is therefore what makes a regime detectable at all.",
      ],
      answer: "50 periods. Without persistence, hidden states exist but leave no statistical trace that any estimator could find.",
    },
    whyItMatters:
      "Markov chains are the simplest model of a changing environment, and the state concept carries directly into reinforcement learning, where the agent's observation must capture everything decision-relevant.",
    demo: { labSlug: "market-regimes", label: "Control a transition matrix" },
    prerequisites: ["expected-value"],
  },
  {
    slug: "market-regimes",
    module: 6,
    title: "Market regimes",
    definition: "Persistent periods during which market behaviour — drift, volatility, correlation — is statistically distinct from other periods.",
    intuition:
      "Markets do not have one personality. Calm trending periods, violent declines and directionless ranges have genuinely different statistics, and a model estimated across all of them describes none of them.",
    formulaNote:
      "Mixing normal distributions with different variances produces fat tails and volatility clustering unconditionally, even though each component is perfectly Gaussian.",
    example: {
      prompt: "Why do regime-switching models produce fat tails from normal parts?",
      working: [
        "In the calm regime, returns are N(0, 0.01²).",
        "In the turbulent regime, returns are N(0, 0.05²).",
        "The unconditional distribution is a mixture of the two.",
        "Most days come from the narrow component, giving a tall peak; the rare wide-component days populate the tails.",
        "The result has higher kurtosis than any single normal distribution.",
      ],
      answer: "A mixture of normals with different variances is not normal. It has a taller peak, thinner shoulders and fatter tails.",
    },
    whyItMatters:
      "Regimes explain why strategies stop working: the environment changed, not the strategy. Detecting a regime change in real time, rather than in hindsight, is one of the genuinely open problems in the field.",
    demo: { labSlug: "market-regimes", label: "Try to infer a hidden regime" },
    prerequisites: ["markov-chains", "stationarity"],
  },
  {
    slug: "backtesting",
    module: 7,
    title: "Backtesting",
    definition: "Simulating how a trading rule would have performed on historical or synthetic data.",
    intuition:
      "Replay history and ask what a rule would have done. The method is only as honest as its treatment of information: the rule may use only what was actually knowable at each decision point.",
    formula: "r^{\\text{strategy}}_t = w_{t-1}\\,r_t - c\\left|w_{t-1} - w_{t-2}\\right|",
    formulaNote:
      "The subscript t−1 on the weight is the entire discipline. A signal computed from day t's close cannot be traded until day t+1.",
    example: {
      prompt: "What happens if you use wₜ instead of wₜ₋₁?",
      working: [
        "The strategy decides its position using the very return it is about to earn.",
        "Almost any rule becomes profitable, including rules built from pure noise.",
        "Nothing errors; the equity curve simply rises smoothly.",
        "This is look-ahead bias, and it is the most common backtesting error.",
      ],
      answer: "You get a spectacular, meaningless result. The failure is silent, which is what makes it dangerous.",
    },
    whyItMatters:
      "A backtest is the main evidence anyone offers for a strategy, and it is extraordinarily easy to make one lie. Knowing the specific failure modes — look-ahead, survivorship, cost omission, data snooping — is more valuable than knowing how to run one.",
    demo: { labSlug: "backtesting", label: "Run five strategies against a synthetic market" },
    prerequisites: ["sharpe-ratio", "drawdown"],
  },
  {
    slug: "transaction-costs",
    module: 7,
    title: "Transaction costs",
    definition: "The total cost of trading: commissions, the bid-ask spread, market impact, slippage and taxes.",
    intuition:
      "Every trade loses a little money before any market move occurs. Cost scales with turnover, which is a property of the trading rule — so a high-frequency rule must clear a far higher bar than a patient one.",
    formula: "\\text{Cost} = c\\sum_{t}\\left|w_t - w_{t-1}\\right| = c \\times \\text{Turnover}",
    example: {
      prompt: "A strategy turns over 50 times a year at 0.1% per trade. What must it earn to break even?",
      working: [
        "Annual cost = 50 × 0.1% = 5%",
        "The strategy must earn 5% per year before producing anything.",
        "If its gross return is 7%, the net is 2%.",
        "A buy-and-hold alternative pays this cost once, not fifty times.",
      ],
      answer: "5% per year, purely in costs. A strategy with a 7% gross edge keeps less than a third of it.",
    },
    whyItMatters:
      "Costs are where most backtested strategies die, and they are the most commonly omitted term. The right order of operations is to model costs first and then ask whether an edge remains.",
    demo: { labSlug: "backtesting", label: "Watch costs destroy a strategy" },
    prerequisites: ["backtesting"],
  },
  {
    slug: "overfitting",
    module: 8,
    title: "Overfitting",
    definition: "Fitting the noise in a particular sample rather than the structure of the process that generated it.",
    intuition:
      "Any dataset contains accidents. A flexible enough model, or a large enough search, will find and encode those accidents — producing something that describes the sample perfectly and the world not at all.",
    formula: "E\\left[\\max_{1\\le i\\le n} Z_i\\right] \\approx \\sqrt{2\\ln n} \\quad\\text{for}\\quad Z_i \\sim N(0,1)",
    formulaNote:
      "The expected maximum of n noisy estimates grows without bound as n increases, even when every true value is zero. Selecting the best of many is therefore biased upward by construction.",
    example: {
      prompt: "You test 100 strategies on random data. What is the best Sharpe you expect to see?",
      working: [
        "Every true Sharpe is exactly zero, since the data is random.",
        "With 1,000 observations, each estimate has standard error around 0.5 annualised.",
        "Expected maximum ≈ √(2 ln 100) = √9.2 ≈ 3.0 standard errors.",
        "That is roughly 1.5 in annualised Sharpe terms.",
      ],
      answer: "About 1.5 — an impressive-looking figure produced entirely by selection, on data with no signal whatsoever.",
    },
    whyItMatters:
      "It is the central reason published and backtested strategies underperform live. Any result selected from a search is biased upward by an amount that grows with the size of the search — and the size of the search is rarely reported.",
    demo: { labSlug: "overfitting", label: "Overfit a strategy deliberately" },
    prerequisites: ["backtesting", "sharpe-ratio"],
  },
  {
    slug: "distribution-shift",
    module: 8,
    title: "Distribution shift",
    definition: "When the data a model encounters in deployment comes from a different distribution than the data it was trained on.",
    intuition:
      "The world changed. Even a model that genuinely learned the training environment can fail, because what it learned no longer applies. This is distinct from overfitting — the model may have learned correctly, about a world that no longer exists.",
    formulaNote:
      "The generalisation gap under shift is the difference between performance on the training distribution and performance on the shifted one. Measuring it requires deliberately constructing the shift.",
    example: {
      prompt: "A strategy trained on 2010–2019 data fails in 2020. Overfitting or distribution shift?",
      working: [
        "Overfitting would mean it also failed on held-out 2010–2019 data.",
        "Distribution shift would mean it worked on held-out 2010s data but failed in 2020.",
        "2020 had volatility far outside the training range, which is a genuine shift.",
        "Distinguishing the two requires an honest out-of-sample test within the original period.",
      ],
      answer: "They are different failures with different fixes, and the only way to tell them apart is a proper held-out test from the training period.",
    },
    whyItMatters:
      "Markets shift constantly — regimes change, participants adapt, regulations change. A model's robustness to shift matters more than its peak performance, and that is precisely the question the RL research framework on this site sets out to study.",
    demo: { labSlug: "market-regimes", label: "Construct a distribution shift" },
    prerequisites: ["overfitting", "market-regimes"],
  },
  {
    slug: "machine-learning",
    module: 9,
    title: "Machine learning",
    definition: "Fitting a flexible model to data by minimising a loss function, rather than specifying the relationship in advance.",
    intuition:
      "Instead of writing the rule, you specify a family of possible rules and let an optimiser pick one. The power comes from flexibility; so does the danger, because a flexible model can fit noise as easily as signal.",
    formulaNote:
      "The bias-variance trade-off: too simple a model misses real structure (bias); too flexible a model fits noise (variance). Total error is minimised somewhere between, and finding that point is most of the craft.",
    example: {
      prompt: "Why is machine learning harder in finance than in image recognition?",
      working: [
        "Images have a stable relationship between pixels and labels; a cat looks like a cat forever.",
        "Markets are non-stationary: the relationship changes, partly because participants adapt to it.",
        "Signal-to-noise is far lower — an R² of 0.01 can be economically meaningful in finance.",
        "Data is limited: there are only about 25,000 trading days in a century.",
        "And the system is adversarial: any edge you find and trade is partly competed away.",
      ],
      answer: "Non-stationarity, low signal-to-noise, limited data and adaptive opponents — four problems image recognition does not have.",
    },
    whyItMatters:
      "ML is widely used in quantitative finance and widely oversold. The techniques are the same; the discipline required to avoid fooling yourself is much greater, because the usual validation methods assume a stationarity that markets do not have.",
    demo: { labSlug: "overfitting", label: "See the bias-variance trade-off directly" },
    prerequisites: ["overfitting", "linear-regression"],
  },
  {
    slug: "reinforcement-learning",
    module: 10,
    title: "Reinforcement learning",
    definition:
      "A framework in which an agent learns a policy — a mapping from states to actions — by interacting with an environment and receiving rewards.",
    intuition:
      "Unlike supervised learning, there are no labelled correct answers. The agent must discover which actions are good by trying them, and the consequences may only become apparent much later.",
    formula: "\\pi^*(s) = \\arg\\max_a\; \\mathbb{E}\\left[\\sum_{t=0}^{\\infty} \\gamma^t R_{t} \;\\middle|\; s_0 = s, a_0 = a\\right]",
    formulaNote:
      "γ is the discount factor, controlling how much future reward is worth relative to immediate reward. The expectation runs over the environment's randomness and the policy's own choices.",
    example: {
      prompt: "Why is reward design the hard part of applying RL to trading?",
      working: [
        "Reward raw return, and the agent learns to take maximum leverage — return is maximised by maximum risk.",
        "Reward Sharpe, and the agent may learn to avoid volatility even when it is well compensated.",
        "Reward drawdown-adjusted return, and the agent becomes conservative, perhaps excessively so.",
        "The agent optimises exactly what you asked for, which is rarely exactly what you wanted.",
      ],
      answer: "The agent is a literal-minded optimiser. Specifying the objective correctly is harder than the learning itself.",
    },
    whyItMatters:
      "RL is a natural fit for sequential decision-making under uncertainty, which describes trading well. It is also extremely prone to overfitting its training environment — which is exactly why the research question on this site is about robustness under distribution shift rather than about peak performance.",
    demo: { labSlug: "backtesting", label: "Compare an Oracle policy against simple rules" },
    prerequisites: ["machine-learning", "markov-chains", "distribution-shift"],
  },
];

export function getLesson(slug: string): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.slug === slug);
}

export function getModule(n: number): Module | undefined {
  return MODULES.find((m) => m.number === n);
}
