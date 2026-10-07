/**
 * Teaching notes.
 *
 * Each note takes one module's mathematics and explains the CODE that
 * implements it: what it does, why the mathematics works, what every variable
 * means, what it assumes, where it breaks, and what would make it return a
 * wrong answer that still looks plausible.
 *
 * The three questions at the end of each note are the ones someone technical
 * would actually ask, with answers written out — because being able to explain
 * a thing is the test of understanding it, and the failure mode this whole
 * section exists to prevent is copying code you cannot defend.
 */

export interface TeachingNote {
  module: number;
  title: string;
  feature: string;
  files: { path: string; role: string }[];
  whatTheCodeDoes: string;
  mathematics: { intro: string; equations: { label: string; latex: string; note?: string }[] };
  whyItWorks: { heading: string; body: string }[];
  variables: { symbol: string; meaning: string }[];
  assumptions: string[];
  limitations: string[];
  failureModes: { title: string; body: string }[];
  beforeMovingOn: string;
  questions: { question: string; answer: string }[];
  quiz: string[];
}

export const TEACHING_NOTES: TeachingNote[] = [
  /* ---------------------------------------------------------------- */
  {
    module: 1,
    title: "Probability and returns",
    feature: "The statistics and randomness layer",
    files: [
      { path: "lib/math/random.ts", role: "Seeded uniform and normal generation" },
      { path: "lib/statistics/descriptive.ts", role: "Mean, variance, moments, rolling windows" },
      { path: "lib/finance/performance.ts", role: "Simple and log returns, and everything built on them" },
    ],
    whatTheCodeDoes:
      "mulberry32(seed) produces a deterministic stream of uniforms in [0,1). normalSampler turns pairs of those into standard normal draws via Box-Muller, caching the spare so two uniforms yield two normals. returns() converts n prices into n−1 proportional changes; logReturns() converts them into n−1 log ratios. variance() takes a ddof flag selecting between dividing by n and by n−1.",
    mathematics: {
      intro:
        "Two pieces of mathematics do the real work here: the Box-Muller transform, and Bessel's correction.",
      equations: [
        {
          label: "Box-Muller",
          latex: "z_0 = \\sqrt{-2\\ln u_1}\\cos(2\\pi u_2), \\qquad z_1 = \\sqrt{-2\\ln u_1}\\sin(2\\pi u_2)",
          note: "Exact, not an approximation. Two independent uniforms produce two independent standard normals.",
        },
        {
          label: "Sample variance",
          latex: "s^2 = \\frac{1}{n-1}\\sum_{i=1}^{n}(x_i - \\bar{x})^2",
          note: "The n−1 is Bessel's correction. Dividing by n gives a biased estimate.",
        },
        {
          label: "Simple and log returns",
          latex: "r_t = \\frac{P_t}{P_{t-1}} - 1, \\qquad \\ell_t = \\ln\\!\\left(\\frac{P_t}{P_{t-1}}\\right)",
          note: "Simple returns aggregate across assets; log returns aggregate across time. Neither does both.",
        },
      ],
    },
    whyItWorks: [
      {
        heading: "Box-Muller",
        body: "Picture a 2-D standard normal as a point in the plane. Its density depends only on distance from the origin, so switch to polar coordinates. The angle is uniform on [0, 2π) — that is the 2πu₂ term. The squared radius turns out to be exponentially distributed with mean 2, and you sample an exponential by taking −2 ln u of a uniform. So √(−2 ln u₁) is the radius and 2πu₂ the angle; project onto the axes with cosine and sine and you have two independent normals.",
      },
      {
        heading: "Bessel's correction",
        body: "You measure deviations from the sample mean, not from the true mean. But the sample mean is pulled toward your own data points, so the deviations you measure are systematically smaller than the ones you wanted. The shortfall works out to exactly a factor of (n−1)/n, so dividing by n−1 instead of n cancels it.",
      },
      {
        heading: "Why log returns add over time",
        body: "ln(a/b) + ln(b/c) = ln(a/c). The intermediate prices cancel inside the logarithm, so a sum of consecutive log returns telescopes into the log return over the whole period. Simple returns have no such identity — you must multiply (1+r) factors.",
      },
    ],
    variables: [
      { symbol: "seed", meaning: "Selects which deterministic sequence the generator produces." },
      { symbol: "spare", meaning: "A cached second Box-Muller normal, so two uniforms yield two normals." },
      { symbol: "ddof", meaning: "Delta degrees of freedom; the divisor is n − ddof. 1 = sample, 0 = population." },
      { symbol: "periodsPerYear", meaning: "252 for daily, 12 monthly, 52 weekly. Drives every annualisation." },
    ],
    assumptions: [
      "Returns are drawn from a stationary distribution — the same μ and σ throughout.",
      "Observations are independent, which is what licenses σ_annual = σ_daily × √252.",
      "The sample is representative of the process you care about.",
      "The generator's output is statistically indistinguishable from uniform.",
    ],
    limitations: [
      "mulberry32 has 32 bits of state, so a period of 2³². Ample here, unsuitable for billions of draws.",
      "Box-Muller calls a logarithm and two trigonometric functions per pair — slower than the Ziggurat algorithm, which is irrelevant at this scale.",
      "Every statistic returned carries no error bar, and nothing in the type system reminds you that it has one.",
    ],
    failureModes: [
      { title: "ddof = 0 on sample data", body: "Understates volatility by a factor of √(n/(n−1)). Negligible at n = 250, material at n = 20." },
      { title: "Mixing return types", body: "Averaging simple returns over time overstates performance. Summing log returns across assets is simply wrong." },
      { title: "Annualising autocorrelated returns", body: "The √252 rule assumes independence. With volatility clustering it understates risk." },
      { title: "Floating-point negative variance", body: "On near-constant input the sum of squares can come out at −1e−18, and the square root of that is NaN. variance() clamps at zero for exactly this reason." },
      { title: "u₁ = 0 in Box-Muller", body: "ln(0) is −Infinity. The sampler loops until u₁ exceeds machine epsilon." },
    ],
    beforeMovingOn:
      "That returns are not prices, and that the choice between simple and log is determined by the direction you are aggregating — across assets or across time. If that is not automatic yet, nothing in Module 2 will land, because geometric Brownian motion is defined in log space.",
    questions: [
      {
        question: "Why n−1 and not n?",
        answer:
          "Because the sample mean sits closer to your data than the true mean does, so deviations measured from it are systematically too small — by exactly a factor of (n−1)/n. Dividing by n−1 corrects that bias. It is only needed because the mean is being estimated from the same sample; if the true mean were known, n would be correct.",
      },
      {
        question: "Your simulation uses Math.random(), right? How do you know your results are not a fluke?",
        answer:
          "It does not. Math.random() has no seed, so results would be unreproducible. Every generator here takes an explicit seed and uses mulberry32, so the same seed gives the same sequence every time. That is what makes seed variation a usable robustness check — I can rerun an experiment changing only the luck. I used it to confirm the GBM generator was unbiased: ten seeds, pooled z of −1.07 against theory.",
      },
      {
        question: "Why annualise volatility with √252 instead of 252?",
        answer:
          "Because variances add for independent returns, not standard deviations. Daily variance × 252 is annual variance; take the square root and the 252 becomes √252. The independence assumption is doing real work — real returns show volatility clustering, so the rule is only approximate on market data.",
      },
    ],
    quiz: [
      "A stock goes $100 → $120 → $96. Give the two simple returns, the two log returns, and the total return. Which pair sums to the total, and why?",
      "You have 20 monthly returns with sample standard deviation 4%. Annualise it, then state the one assumption that makes your answer valid.",
      "variance([5,5,5,5]) returns 0, and variance([5]) with ddof=1 also returns 0. Are these zero for the same reason? Explain each.",
      "You draw 1,000 standard normals and get a sample mean of 0.04. Is the generator broken? Show the calculation that decides it.",
      "Box-Muller produces two normals per call but the function returns one. Where does the second go, and what would break if you discarded it?",
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    module: 2,
    title: "Monte Carlo simulation",
    feature: "The GBM generator and the Monte Carlo lab",
    files: [
      { path: "lib/simulation/generators.ts", role: "generateGBM, simulateTerminalStats" },
      { path: "lib/hooks/useBatchedSimulation.ts", role: "Cooperative chunking so large runs do not freeze the tab" },
      { path: "app/labs/monte-carlo/MonteCarloLab.tsx", role: "The lab UI and streaming accumulator" },
    ],
    whatTheCodeDoes:
      "generateGBM walks a price forward using the exact solution of the GBM stochastic differential equation, one step at a time, drawing a fresh standard normal at each step. The lab runs this up to 50,000 times. Rather than storing every path, it keeps the first 120 in full for drawing and reduces every other path to its ending price and maximum drawdown as it is generated — because 50,000 paths of 252 steps would be about 100 MB as float64 and would crash a phone.",
    mathematics: {
      intro:
        "The continuous model is a stochastic differential equation; the code uses its exact solution rather than approximating the SDE directly.",
      equations: [
        {
          label: "The SDE",
          latex: "dS_t = \\mu S_t\\,dt + \\sigma S_t\\,dW_t",
          note: "Both terms scale with S, which is what makes the process multiplicative and keeps prices positive.",
        },
        {
          label: "The exact solution — what the code computes",
          latex: "S_{t+\\Delta t} = S_t \\exp\\!\\left[\\left(\\mu - \\tfrac{\\sigma^2}{2}\\right)\\Delta t + \\sigma\\sqrt{\\Delta t}\\,Z\\right]",
          note: "Z ~ N(0,1), drawn independently at each step.",
        },
        {
          label: "Terminal distribution",
          latex: "\\ln S_T \\sim N\\!\\left(\\ln S_0 + \\left(\\mu - \\tfrac{\\sigma^2}{2}\\right)T,\; \\sigma^2 T\\right)",
          note: "The log price is exactly normal, so the price itself is log-normal.",
        },
      ],
    },
    whyItWorks: [
      {
        heading: "Why the −σ²/2 term exists",
        body: "This is the Itô correction, and it is not a fudge factor. The exponential function is convex, so E[eˣ] > e^E[ˣ]: exponentiating a zero-mean random variable gives something whose mean is above 1. Without subtracting σ²/2, volatility alone would manufacture free expected growth, and the realised average return would exceed the μ you asked for. With it, E[S_T] = S₀e^(μT) exactly.",
      },
      {
        heading: "Why that makes the median differ from the mean",
        body: "The mean grows at μ while the median grows at μ − σ²/2. At σ = 40% that gap is 8% per year. The mean is dragged upward by a thin tail of enormous outcomes the typical path never sees. This is volatility drag, and it is why quoting an average return can describe almost nobody's experience.",
      },
      {
        heading: "Why we can step exactly rather than approximate",
        body: "Applying Itô's lemma to ln(S) turns the multiplicative SDE into an additive one with constant coefficients, which integrates in closed form. So the discrete step above is not an Euler approximation — it is exact at every step size. A naive Euler scheme (S + μS·dt + σS·√dt·Z) carries discretisation error and can even produce negative prices.",
      },
      {
        heading: "Why the error falls as 1/√N",
        body: "The Monte Carlo estimate is a sample mean, so its standard error is σ/√N by the central limit theorem. Halving the error therefore needs four times the samples, and one more decimal digit needs a hundred times. That is the method's defining limitation.",
      },
    ],
    variables: [
      { symbol: "S_0", meaning: "Initial price. Because GBM is multiplicative, this only rescales the picture." },
      { symbol: "\\mu", meaning: "Expected annual continuously-compounded growth rate — the drift." },
      { symbol: "\\sigma", meaning: "Annualised volatility of log returns." },
      { symbol: "\\Delta t", meaning: "Length of one step in years: horizon ÷ steps." },
      { symbol: "Z", meaning: "An independent standard normal draw at each step." },
      { symbol: "\\text{driftTerm}", meaning: "Precomputed (μ − σ²/2)Δt, constant across steps." },
      { symbol: "\\text{diffusionScale}", meaning: "Precomputed σ√Δt, constant across steps." },
    ],
    assumptions: [
      "Constant drift μ for the whole horizon.",
      "Constant volatility σ — no clustering, no regimes.",
      "Continuous price paths with no jumps.",
      "Log returns exactly normal, so tails decay like e^(−x²/2).",
      "Independent increments, which rules out momentum and mean reversion by construction.",
      "No transaction costs, no spread, no market impact.",
    ],
    limitations: [
      "Real markets produce 5σ days every few years; this model says once every 14,000.",
      "The simulation cannot tell you μ or σ. Estimating them is the actual hard problem, assumed away in an input field.",
      "Percentile bands in the lab are computed from the 120 stored paths, not from all 50,000 — stated in the chart footnote.",
      "Output is a conditional: if returns behaved like this, the distribution would look like that. It is not a forecast.",
    ],
    failureModes: [
      { title: "Dropping the Itô correction", body: "E[S_T] becomes S₀e^((μ+σ²/2)T). At σ = 20% that inflates the expected return by 2% a year — large enough to matter, small enough to miss without a test." },
      { title: "Stepping the SDE naively", body: "An Euler scheme accumulates discretisation error and can produce negative prices at high volatility." },
      { title: "Seeding derived paths by 1, 2, 3…", body: "Small-state generators seeded with adjacent integers can show correlated early draws. The code spaces derived seeds by a large odd constant." },
      { title: "Storing every path", body: "50,000 × 252 float64 values is about 100 MB. The streaming accumulator keeps only scalars per path beyond the first 120." },
      { title: "Running a long loop synchronously", body: "13 million draws in one for-loop freezes the tab. startTransition does not help — React can deprioritise a render but cannot interrupt a loop. useBatchedSimulation yields between batches." },
    ],
    beforeMovingOn:
      "Why the mean and the median of a GBM differ, and that the gap is exactly σ²/2 per year. If you cannot explain why increasing volatility lowers the typical outcome while leaving the average untouched, the portfolio and options material will feel arbitrary.",
    questions: [
      {
        question: "Why is there a minus sigma-squared-over-two in the exponent?",
        answer:
          "It is the Itô correction. The exponential is convex, so E[eˣ] exceeds e^E[ˣ] — exponentiating zero-mean noise produces something with mean above 1. Without subtracting σ²/2, volatility would create expected growth out of nothing and the realised mean would exceed the μ I specified. With it, E[S_T] = S₀e^(μT) exactly. I have a test that checks this across 60,000 paths; without the term it fails at about eight standard errors.",
      },
      {
        question: "You simulate 252 steps for a one-year option. Why not just one step?",
        answer:
          "For a European payoff you could, and in the Options Lab I do — the log price at T is normal with known mean and variance, so a single step is exact, not an approximation. I step daily in the Monte Carlo lab because I want the path, not just the endpoint: maximum drawdown is path-dependent, and so is the fan chart. Stepping matters when the quantity you care about depends on the route taken.",
      },
      {
        question: "How many simulations do you need?",
        answer:
          "It depends on the precision you want, because the standard error falls as σ_payoff/√N. If the payoff standard deviation is $14 and I want a cent of accuracy, that is N > (14/0.01)² ≈ 2 million. The practical answer is to report the standard error alongside the estimate rather than picking N by feel — which is what the Options Lab does, with a confidence interval and a convergence trace.",
      },
    ],
    quiz: [
      "With μ = 10% and σ = 30% over one year, compute the mean and median terminal values of a $100 start. Explain the gap in one sentence.",
      "A colleague's GBM code produces a realised mean return of 12% when they set μ = 10% and σ = 20%. What is the bug, and how did you identify it from those three numbers alone?",
      "Your Monte Carlo estimate has a standard error of $0.08. How many more simulations do you need to get it under $0.02?",
      "Why can a GBM price never reach zero, and what does that imply about using it to model default risk?",
      "You run 50,000 paths and the tab freezes for two seconds. Explain why wrapping the loop in startTransition would not fix it, and what would.",
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    module: 3,
    title: "Correlation and covariance",
    feature: "The linear algebra layer and the Correlation Lab",
    files: [
      { path: "lib/math/linearAlgebra.ts", role: "Covariance construction, Cholesky, validity checking" },
      { path: "lib/statistics/descriptive.ts", role: "Sample covariance and correlation" },
      { path: "app/labs/correlation/CorrelationLab.tsx", role: "The two-asset demonstration" },
    ],
    whatTheCodeDoes:
      "covarianceFromCorrelation turns a correlation matrix and a vector of volatilities into a covariance matrix. cholesky factors that matrix into L·Lᵀ, which is the mechanism for simulating correlated random variables. isValidCorrelationMatrix checks symmetry, unit diagonal, bounded entries, and positive semi-definiteness — the last of which catches correlation sets that no real assets could have.",
    mathematics: {
      intro: "Correlation is covariance made interpretable; Cholesky is how you impose it on random draws.",
      equations: [
        { label: "Covariance from correlation", latex: "\\Sigma_{ij} = \\rho_{ij}\\,\\sigma_i\\,\\sigma_j" },
        { label: "Correlation", latex: "\\rho_{XY} = \\frac{\\operatorname{Cov}(X,Y)}{\\sigma_X \\sigma_Y}", note: "Dimensionless and bounded in [−1, 1]." },
        { label: "Cholesky factorisation", latex: "\\Sigma = L L^{\\top}, \\qquad x = Lz \;\\Longrightarrow\; \\operatorname{Cov}(x) = \\Sigma", note: "z is a vector of independent standard normals." },
      ],
    },
    whyItWorks: [
      {
        heading: "Why x = Lz has the covariance you wanted",
        body: "Cov(x) = E[Lz zᵀ Lᵀ] = L·E[z zᵀ]·Lᵀ = L·I·Lᵀ = L Lᵀ = Σ. The independent noise has identity covariance, and multiplying by L reshapes it into exactly Σ. Three lines of algebra, and every correlated simulation on the site depends on them.",
      },
      {
        heading: "Why Cholesky failing is informative",
        body: "The factorisation only exists for a positive-definite matrix. If a user specifies A–B at +0.9, B–C at +0.9 and A–C at −0.9, no set of assets could produce those correlations — the geometry is impossible. Cholesky's failure is how the code detects that, and the lab surfaces it as an explanation rather than a crash.",
      },
      {
        heading: "Why correlation is bounded and covariance is not",
        body: "Dividing by both standard deviations removes the units and, by Cauchy-Schwarz, bounds the result to [−1, 1]. Covariance carries the same information in units of (units of X)(units of Y), which is why rescaling X from decimals to percent multiplies the covariance by 100 while leaving the relationship unchanged.",
      },
    ],
    variables: [
      { symbol: "\\Sigma", meaning: "The covariance matrix. Diagonal entries are variances." },
      { symbol: "L", meaning: "The lower-triangular Cholesky factor." },
      { symbol: "z", meaning: "A vector of independent standard normals, one per asset, per step." },
      { symbol: "\\rho", meaning: "Correlation between a pair of assets." },
    ],
    assumptions: [
      "Correlation is constant over the simulated period.",
      "Dependence is fully captured by a linear measure.",
      "The correlation matrix supplied is internally consistent.",
      "Returns are elliptically distributed, so correlation summarises the joint behaviour.",
    ],
    limitations: [
      "Correlation measures only linear association. If Y = X² with X symmetric about zero, the correlation is exactly zero while Y is completely determined by X.",
      "A single ρ is an average over all market conditions. Real correlations rise toward 1 in crises, so the diversification benefit computed in calm markets partly evaporates when it is needed.",
      "At exactly ρ = ±1 the matrix is singular; the code adds a tiny ridge so the simulation still runs, which means realised correlation is not exactly ±1.",
    ],
    failureModes: [
      { title: "Accepting an inconsistent correlation matrix", body: "Without a positive-definiteness check, Cholesky returns garbage or NaN and every downstream number is meaningless." },
      { title: "Forgetting that Cholesky needs the covariance, not the correlation", body: "Factoring the correlation matrix and then scaling produces the right answer only if you scale correctly; factoring Σ directly is less error-prone." },
      { title: "Reading a zero correlation as independence", body: "Zero correlation means no linear relationship. It does not mean no relationship." },
      { title: "Estimating correlation on overlapping windows", body: "Rolling correlations computed on overlapping data are strongly autocorrelated, which makes apparent regime changes look more significant than they are." },
    ],
    beforeMovingOn:
      "That Cov(x) = L Lᵀ when x = Lz, and that this is the only mechanism by which any simulation on this site produces correlated series. Portfolio theory in Module 4 is a direct consequence.",
    questions: [
      {
        question: "How do you generate correlated random returns?",
        answer:
          "Cholesky. Factor the covariance matrix into L·Lᵀ with L lower-triangular, draw a vector of independent standard normals z, and set x = Lz. Then Cov(x) = L·E[zzᵀ]·Lᵀ = L·I·Lᵀ = Σ, which is exactly the covariance I wanted. If the factorisation fails, the covariance matrix was not positive definite, which usually means the user specified a geometrically impossible set of correlations.",
      },
      {
        question: "Two assets have correlation zero. Are they independent?",
        answer:
          "No. Zero correlation means no linear relationship. Y = X² with X symmetric about zero has correlation exactly zero while Y is completely determined by X. Independence is a much stronger condition — it says the joint distribution factors. For jointly normal variables the two coincide, which is probably why the confusion is so common, but that is a special case rather than a general rule.",
      },
      {
        question: "Why does your correlation lab refuse some inputs?",
        answer:
          "Because not every matrix of numbers in [−1, 1] is a valid correlation matrix. It also has to be positive semi-definite. If A and B are +0.9 correlated and B and C are +0.9 correlated, then A and C cannot be −0.9 — the geometry does not permit it. I detect this by attempting a Cholesky factorisation with a small ridge; if it fails, the matrix is inadmissible and I say so rather than producing numbers that mean nothing.",
      },
    ],
    quiz: [
      "Two assets each have 25% volatility and correlation 0.4. Compute the covariance and the volatility of a 50/50 portfolio.",
      "You are handed a 3×3 correlation matrix with 1s on the diagonal and 0.95 everywhere off it. Is it valid? How would you check without doing the arithmetic by hand?",
      "Explain in two sentences why x = Lz produces the covariance you asked for.",
      "A rolling 60-day correlation between two assets jumps from 0.2 to 0.8. Give two explanations that do not involve the underlying relationship changing.",
      "Why does the Correlation Lab give exactly 0.00% portfolio volatility at ρ = −1 with equal volatilities and equal weights? Derive it.",
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    module: 4,
    title: "Portfolio mathematics",
    feature: "Mean-variance optimisation and the efficient frontier",
    files: [
      { path: "lib/finance/portfolio.ts", role: "Portfolio metrics, optimal portfolios, frontier" },
      { path: "lib/math/linearAlgebra.ts", role: "Quadratic forms and the linear solver" },
      { path: "app/labs/portfolio-optimizer/PortfolioLab.tsx", role: "The optimiser UI" },
    ],
    whatTheCodeDoes:
      "portfolioVariance evaluates the quadratic form wᵀΣw. minimumVariancePortfolio and maxSharpePortfolio solve closed-form expressions involving Σ⁻¹. efficientFrontier solves a constrained minimisation at each of 60–200 target returns by assembling a block matrix and running Gaussian elimination with partial pivoting. riskContributions decomposes total volatility into per-asset shares using Euler's theorem.",
    mathematics: {
      intro: "The whole of Markowitz follows from one asymmetry: return is linear in the weights, risk is quadratic.",
      equations: [
        { label: "Expected return", latex: "E(R_p) = \\mathbf{w}^{\\top}\\boldsymbol{\\mu}", note: "Linear. Correlation does not appear anywhere." },
        { label: "Variance", latex: "\\sigma_p^2 = \\mathbf{w}^{\\top}\\boldsymbol{\\Sigma}\\mathbf{w} = \\sum_i\\sum_j w_i w_j \\sigma_{ij}", note: "Quadratic. The cross terms carry the correlation." },
        { label: "Minimum variance", latex: "\\mathbf{w}_{\\text{mv}} = \\frac{\\boldsymbol{\\Sigma}^{-1}\\mathbf{1}}{\\mathbf{1}^{\\top}\\boldsymbol{\\Sigma}^{-1}\\mathbf{1}}", note: "Expected returns do not appear — a genuinely useful property." },
        { label: "Maximum Sharpe (tangency)", latex: "\\mathbf{w}_{\\text{ms}} \\propto \\boldsymbol{\\Sigma}^{-1}(\\boldsymbol{\\mu} - r_f\\mathbf{1})" },
      ],
    },
    whyItWorks: [
      {
        heading: "Where diversification comes from",
        body: "Expand the two-asset variance: w₁²σ₁² + w₂²σ₂² + 2w₁w₂ρσ₁σ₂. The last term carries ρ, and ρ can be negative. When it is, that term subtracts from total variance and the portfolio is less risky than either part. Expected return, being linear, is untouched. Risk reduction at no cost in return — the only genuinely free lunch in finance, and it is a fact about algebra.",
      },
      {
        heading: "Why covariances dominate for large portfolios",
        body: "For n assets there are n variance terms but n(n−1) covariance terms. By n = 10 that is 10 against 90. Risk in any reasonably sized portfolio is governed by how assets move together, not by how volatile they are individually.",
      },
      {
        heading: "Why the frontier is solved, not sampled",
        body: "Minimising wᵀΣw subject to wᵀμ = target and wᵀ1 = 1 introduces two Lagrange multipliers, giving an (n+2)-dimensional linear system. The code assembles that block matrix and solves it exactly. Sampling random portfolios shows the feasible set, which is pedagogically better; solving gives the true boundary.",
      },
      {
        heading: "Why risk contributions sum to one",
        body: "Portfolio volatility is homogeneous of degree 1 in the weights, so by Euler's theorem the weighted marginal contributions sum exactly to σ_p. Dividing through gives fractions summing to 1 — which lets you say an asset is 10% of capital but 40% of risk.",
      },
    ],
    variables: [
      { symbol: "\\mathbf{w}", meaning: "Weight vector, constrained to sum to 1." },
      { symbol: "\\boldsymbol{\\mu}", meaning: "Vector of expected returns." },
      { symbol: "\\boldsymbol{\\Sigma}", meaning: "Covariance matrix." },
      { symbol: "r_f", meaning: "Risk-free rate, used in the Sharpe ratio and to locate the tangency portfolio." },
      { symbol: "\\lambda_1, \\lambda_2", meaning: "Lagrange multipliers on the return and budget constraints." },
    ],
    assumptions: [
      "μ, σ and ρ are known exactly rather than estimated.",
      "Those parameters are stable over the holding period.",
      "Risk means variance — upside and downside penalised equally.",
      "Returns are elliptically distributed, or utility is quadratic.",
      "Perfect divisibility, no transaction costs, a single period.",
    ],
    limitations: [
      "Both closed forms invert Σ, and inversion amplifies estimation error. Small changes in estimated μ produce wildly different weights — which is why naive optimisers are sometimes called error maximisers.",
      "With a no-short constraint there is no closed form; the lab approximates the frontier from the sampled cloud and says so.",
      "Variance is blind to skew and fat tails, so a strategy that sells insurance looks efficient until it does not.",
    ],
    failureModes: [
      { title: "Drawing the dominated tail as the frontier", body: "The upper envelope of a random cloud rises, peaks, then falls. Those trailing points are on the feasible boundary but are dominated — more risk for less return. I trim the envelope to its monotonically increasing portion, with a test asserting no member dominates another." },
      { title: "Treating estimated μ as known", body: "The standard error on an expected return is roughly σ/√T. For a 20% volatility asset, 25 years of data leaves a 4% standard error — the same order as the quantity itself." },
      { title: "Inverting a singular covariance matrix", body: "Two perfectly correlated assets make the system degenerate. The code returns null rather than producing nonsense." },
      { title: "Confusing capital share with risk share", body: "A 10% position in a volatile, highly correlated asset can be 40% of portfolio risk. Only the Euler decomposition reveals it." },
    ],
    beforeMovingOn:
      "That expected return is linear and risk is quadratic, and that every result in Markowitz follows from that single asymmetry. If you can derive the two-asset variance formula from scratch and say which term carries the diversification, you are ready.",
    questions: [
      {
        question: "Why does adding a volatile asset sometimes reduce portfolio risk?",
        answer:
          "Because risk is quadratic in the weights and the cross term carries the correlation. In w₁²σ₁² + w₂²σ₂² + 2w₁w₂ρσ₁σ₂, a negative ρ makes the final term subtract from total variance. If the new asset moves opposite to what you already hold, the cancellation can outweigh its own contribution. Its standalone volatility is close to irrelevant; what matters is its covariance with the existing portfolio.",
      },
      {
        question: "Why do people say mean-variance optimisers are error maximisers?",
        answer:
          "Because the optimal weights involve Σ⁻¹μ, and matrix inversion amplifies estimation error. Expected returns are the noisiest quantity in finance — standard error around σ/√T — so the optimiser confidently takes enormous positions in whichever asset happened to have the highest estimated return. You can see it in the lab: nudge one expected return by half a percent and the max-Sharpe allocation swings dramatically. It is why practitioners add constraints, shrink estimates toward a prior, or fall back on minimum-variance, which does not use μ at all.",
      },
      {
        question: "Your frontier is computed two different ways. Why?",
        answer:
          "With short selling allowed, the constrained minimisation has a closed form — two Lagrange multipliers give an (n+2) linear system I solve exactly at each target return. With a no-short constraint it becomes a quadratic program with inequality constraints and there is no closed form, so I take the upper envelope of the random-portfolio cloud and trim it to the non-dominated portion. The lab states which method produced the curve, because the second is an approximation whose quality improves with sample size.",
      },
    ],
    quiz: [
      "Two assets: 12% return / 20% vol, and 6% return / 10% vol, correlation 0.3. Compute the expected return and volatility of a 60/40 portfolio.",
      "For the same two assets, derive the minimum-variance weight from scratch.",
      "A portfolio holds 10% in an asset and that asset accounts for 35% of portfolio risk. What two properties of the asset could produce this?",
      "Why does the minimum-variance portfolio formula not contain expected returns, and why is that practically useful?",
      "Your optimiser returns a weight of +340% in one asset and −240% in another. Nothing crashed. What has gone wrong, and what three changes would you make?",
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    module: 5,
    title: "Time series",
    feature: "AR(1) generation and autocorrelation diagnostics",
    files: [
      { path: "lib/simulation/generators.ts", role: "generateAR1, generateOrnsteinUhlenbeck" },
      { path: "lib/statistics/descriptive.ts", role: "autocorrelation, autocorrelationFunction, confidence band" },
      { path: "app/labs/random-walk/RandomWalkLab.tsx", role: "Four processes side by side with their ACFs" },
    ],
    whatTheCodeDoes:
      "generateAR1 produces a return series with a tunable memory parameter φ, rescaling the innovations so the realised volatility stays at the target regardless of φ. autocorrelationFunction computes the correlation of the series with time-shifted copies of itself at lags 1..k, using the standard estimator that divides every lag by the same total variance. The lab plots the ACF of returns alongside the ACF of squared returns.",
    mathematics: {
      intro: "One process and one diagnostic carry this module.",
      equations: [
        { label: "AR(1)", latex: "r_t = c + \\varphi\\, r_{t-1} + \\varepsilon_t, \\qquad \\varepsilon_t \\sim N(0, \\sigma_\\varepsilon^2)" },
        { label: "Theoretical ACF", latex: "\\operatorname{Corr}(r_t, r_{t-k}) = \\varphi^{\\,k}", note: "Memory decays geometrically with the lag." },
        { label: "Unconditional variance", latex: "\\operatorname{Var}(r_t) = \\frac{\\sigma_\\varepsilon^2}{1 - \\varphi^2}", note: "Larger than the shock variance for any non-zero φ — which is why the code rescales." },
        { label: "Noise band", latex: "\\pm\\frac{1.96}{\\sqrt{n}}", note: "Under the null of no autocorrelation, estimates fall inside this 95% of the time." },
      ],
    },
    whyItWorks: [
      {
        heading: "Why the innovations are rescaled by √(1 − φ²)",
        body: "A stationary AR(1) has unconditional variance σ_ε²/(1 − φ²), which exceeds the shock variance whenever φ ≠ 0. If the shocks went in unscaled, turning up φ would also turn up total volatility, and any comparison across φ would confound memory with scale. Scaling the innovations by √(1 − φ²) holds realised volatility at the target so only the memory varies.",
      },
      {
        heading: "Why stationarity requires |φ| < 1",
        body: "At |φ| ≥ 1 shocks never decay: each one is passed forward undiminished or amplified, variance grows without bound, and there is no long-run mean to revert to. The generator rejects those values rather than silently producing a divergent series.",
      },
      {
        heading: "Why the squared-return ACF is the more informative chart",
        body: "Squared returns proxy for variance, so their autocorrelation measures whether volatility clusters. A random walk and a regime-switching market can have identical, near-zero return autocorrelation while differing enormously in squared-return autocorrelation. That combination — unpredictable returns, highly predictable volatility — is precisely what real markets show, and it is why volatility forecasting succeeded where return forecasting did not.",
      },
    ],
    variables: [
      { symbol: "\\varphi", meaning: "Memory parameter. Positive is momentum, negative is mean reversion, zero is a random walk." },
      { symbol: "\\varepsilon_t", meaning: "The independent shock — the only new information each period." },
      { symbol: "\\theta", meaning: "Ornstein-Uhlenbeck speed of mean reversion; half-life is ln2/θ." },
      { symbol: "\\text{maxLag}", meaning: "How many lags the correlogram displays." },
    ],
    assumptions: [
      "The process is stationary, so |φ| < 1.",
      "Shocks are independent and normally distributed.",
      "Dependence is linear and captured by a single lag.",
      "The parameters do not change over the sample.",
    ],
    limitations: [
      "Autocorrelation detects only linear dependence. A deterministic series can show zero autocorrelation at every lag.",
      "The standard error on an ACF estimate is about 1/√n, so detecting a true φ of 0.03 reliably needs tens of thousands of observations — more daily data than most markets have ever produced.",
      "AR(1) has one lag of memory. Real dependence structures are richer, which is what ARMA and GARCH exist for.",
    ],
    failureModes: [
      { title: "Reading significance into individual ACF bars", body: "A 95% band means each lag has a 5% chance of falling outside by luck. Across 20 lags you expect one exceedance. Treating that as structure is multiple testing." },
      { title: "Letting φ change the volatility", body: "Without the √(1 − φ²) rescaling, comparisons across φ confound memory with scale — the same class of error that made the regime process overshoot its target volatility by 36%." },
      { title: "Regressing non-stationary series on each other", body: "Two unrelated trending series appear strongly related. This is spurious regression; difference to returns first." },
      { title: "Concluding randomness from zero autocorrelation", body: "It is evidence against linear predictability, not evidence of independence." },
    ],
    beforeMovingOn:
      "The difference between the ACF of returns and the ACF of squared returns, and why real markets show almost nothing in the first and a great deal in the second. Module 6 is an explanation of where that pattern comes from.",
    questions: [
      {
        question: "How would you test whether a return series is predictable?",
        answer:
          "Start with the autocorrelation function and compare each lag against the ±1.96/√n white-noise band — while remembering that across 20 lags you expect one exceedance by chance, so individual bars are not evidence. Then look at the ACF of squared returns, which usually tells a completely different story: near-zero return autocorrelation alongside strong squared-return autocorrelation means the returns are unpredictable but the volatility is not. And autocorrelation only detects linear dependence, so a flat ACF rules out linear predictability rather than establishing randomness.",
      },
      {
        question: "Why does your AR(1) generator rescale the shocks?",
        answer:
          "Because a stationary AR(1) has unconditional variance σ_ε²/(1 − φ²). If I fed shocks in unscaled, raising φ would raise total volatility at the same time as adding memory, and any comparison across φ would be confounded. Scaling by √(1 − φ²) keeps realised volatility at the target so φ changes only the memory. I have a test asserting realised volatility stays at 20% for φ of 0, 0.5 and −0.5.",
      },
      {
        question: "Why does finance model returns rather than prices?",
        answer:
          "Prices are not stationary — they wander with no fixed mean — and almost every statistical tool assumes stationarity. Regressing one non-stationary series on another produces impressive, meaningless results, because both trend and therefore appear related. Differencing to returns removes the trend and restores approximate stationarity. Returns are only approximately stationary, since volatility clusters, but it is close enough for most of the toolkit to apply.",
      },
    ],
    quiz: [
      "An AR(1) has φ = 0.4. What are the theoretical autocorrelations at lags 1, 2 and 3?",
      "You have 500 observations. What is the 95% noise band for the ACF, and how many of 25 lags would you expect outside it under the null?",
      "A series has lag-1 return autocorrelation of 0.01 and lag-1 squared-return autocorrelation of 0.35. Describe the market in one sentence.",
      "Why does the generator reject φ = 1, and what is that process called?",
      "An OU process has θ = 4 per year. What is the half-life of a deviation, and what would θ = 0.5 imply instead?",
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    module: 6,
    title: "Market regimes",
    feature: "Markov-switching simulation and hidden-state inference",
    files: [
      { path: "lib/simulation/generators.ts", role: "generateRegimeMarket, stationaryDistribution" },
      { path: "lib/labs/marketRegimes.ts", role: "Transition matrix construction from persistence" },
      { path: "app/labs/market-regimes/RegimeLab.tsx", role: "The simulator and the detection challenge" },
    ],
    whatTheCodeDoes:
      "generateRegimeMarket maintains a hidden state, draws a conditionally normal return using that state's drift and volatility, then transitions according to a row-stochastic matrix. Critically it transitions AFTER generating the return, so the recorded state is the one that actually produced it. stationaryDistribution finds the long-run occupancy by power iteration. The lab scores a crude observable detector against the known hidden states.",
    mathematics: {
      intro: "A Markov chain over hidden states, with conditionally Gaussian emissions.",
      equations: [
        { label: "Markov property", latex: "P(s_{t+1} = j \\mid s_t = i, s_{t-1}, \\ldots) = P_{ij}", note: "The current state contains everything relevant about the past." },
        { label: "Conditional emission", latex: "r_t \\mid s_t = i \;\\sim\; N\\!\\left(\\left(\\mu_i - \\tfrac{\\sigma_i^2}{2}\\right)\\Delta t,\; \\sigma_i^2 \\Delta t\\right)" },
        { label: "Expected run length", latex: "E[\\text{duration in state } i] = \\frac{1}{1 - P_{ii}}", note: "Geometric distribution. This single number decides whether a regime is detectable." },
        { label: "Stationary distribution", latex: "\\boldsymbol{\\pi} = \\boldsymbol{\\pi} P", note: "Found by iterating the chain forward to convergence." },
      ],
    },
    whyItWorks: [
      {
        heading: "Why persistence decides detectability",
        body: "Run length is geometrically distributed, so expected duration is 1/(1 − Pᵢᵢ). At 0.97 a regime lasts about 33 days — long enough for a 40-day rolling statistic to partly resolve it. At 0.5 it lasts two days, and no rolling window of any length can track it. The hidden state still exists and still drives returns; it simply leaves no statistical trace. This reframes the question from 'is this market predictable?' to 'does its structure persist long enough to estimate before it changes?'",
      },
      {
        heading: "Why a mixture of normals is not normal",
        body: "Most days come from the low-volatility component, producing a tall narrow peak. The rare high-volatility days populate the tails. The result has higher kurtosis than any single normal — fat tails and volatility clustering, generated from entirely Gaussian ingredients. This is one of the simplest mechanisms that reproduces the two most prominent features of real returns.",
      },
      {
        heading: "Why the transition happens after the emission",
        body: "If you transition first and then emit, the recorded state is the one the market is moving into, not the one that produced the return. That off-by-one makes regime labels appear one step ahead of the data, which quietly inflates any detector scored against them.",
      },
    ],
    variables: [
      { symbol: "P_{ij}", meaning: "Probability of moving from regime i to regime j in one step." },
      { symbol: "P_{ii}", meaning: "Persistence — the diagonal. The parameter that matters most." },
      { symbol: "\\boldsymbol{\\pi}", meaning: "Stationary distribution: long-run fraction of time in each state." },
      { symbol: "\\text{occupancy}", meaning: "Observed fraction of time in each state in this finite sample." },
    ],
    assumptions: [
      "A finite, known number of regimes — here exactly three.",
      "Constant drift and volatility within a regime.",
      "Constant transition probabilities.",
      "Instantaneous switching between discrete states.",
      "The Markov property: how long you have been in a state does not affect the chance of leaving.",
    ],
    limitations: [
      "That a three-state Markov model can generate realistic behaviour does not mean markets are one. Many processes produce fat tails and clustering; matching those two features is a very low bar.",
      "Detection accuracy is measurable only because the data is synthetic. On real data there is no ground truth, so the central claim of any live regime system cannot be scored when it matters.",
      "Observed occupancy converges to π only over long runs; at a few thousand steps the gap is substantial.",
    ],
    failureModes: [
      { title: "Transitioning before emitting", body: "Shifts the regime labels one step relative to the returns and inflates every detector score." },
      { title: "A transition matrix whose rows do not sum to 1", body: "Validated explicitly, with a small tolerance so UI sliders producing 0.333/0.333/0.334 are accepted." },
      { title: "Judging an imbalanced detector by accuracy", body: "A model that never predicts the minority class scores higher accuracy while being useless. Report per-class recall." },
      { title: "Reading regimes off a chart in hindsight", body: "Trivially easy and nearly worthless. The useful version uses only data available at the time." },
    ],
    beforeMovingOn:
      "That persistence, not predictability, determines whether a hidden state can be recovered — and that a mixture of normals produces fat tails without any single component being fat-tailed.",
    questions: [
      {
        question: "Where do fat tails come from in your simulation?",
        answer:
          "From mixing. Each regime emits perfectly normal returns, but the unconditional distribution is a mixture of three normals with different variances. Most days come from the low-volatility component, giving a tall narrow peak; the rare high-volatility days populate the tails. The result has positive excess kurtosis — in my default run, around 0.5 — despite every component being Gaussian. It is one of the simplest mechanisms that reproduces a real market feature without assuming it.",
      },
      {
        question: "Your detector scores 41.6% accuracy against a 45.7% baseline. Is it broken?",
        answer:
          "No, and this is the more interesting answer. Its recall on bear regimes is 50.7% against a 23% base rate — more than double chance on the state anyone actually cares about identifying. The accuracy figure is lower because it trades many correct majority-class guesses for fewer correct minority-class guesses. A model that never predicted 'bear' would score higher accuracy while being useless. That is exactly why classification work reports per-class recall and precision rather than a single accuracy number.",
      },
      {
        question: "Why is it easier to detect volatility regimes than drift regimes?",
        answer:
          "Signal-to-noise. Bear volatility is 34% against bull's 13% — a gap a rolling estimate resolves from a few weeks of data. Drift is buried: separating a 14% drift from a 1% drift at these volatility levels needs years, and by then the regime has changed many times. The standard error on an estimated mean is σ/√T, and σ is large relative to the difference in μ. That is why volatility forecasting is a mature field and return forecasting is not — not because one attracted better researchers.",
      },
    ],
    quiz: [
      "P(bull → bull) = 0.96. What is the expected length of a bull run, and what window length would you need to detect it?",
      "Give the stationary distribution of a two-state chain with P(A→B) = 0.02 and P(B→A) = 0.08.",
      "Explain in two sentences why conditionally normal returns can be unconditionally fat-tailed.",
      "Your regime detector has 90% accuracy. The market is in a bull regime 90% of the time. What have you learned?",
      "Why does the simulation transition state after generating the return rather than before? What would break otherwise?",
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    module: 7,
    title: "Backtesting",
    feature: "The strategy framework and cost accounting",
    files: [
      { path: "lib/finance/strategies.ts", role: "Signal generation, the one-step lag, turnover-based costs" },
      { path: "app/labs/backtesting/BacktestLab.tsx", role: "Six strategies across four markets" },
    ],
    whatTheCodeDoes:
      "rawSignal computes a desired exposure for each day from data up to and including that day. applyStrategy then enforces the lag in one place: the position held through day t is the signal from day t−1. Cost is charged on the absolute change in position, so a round trip from cash to invested and back is charged twice. An Oracle strategy reads the hidden regime directly, as an upper bound on what regime timing could achieve.",
    mathematics: {
      intro: "There is almost no mathematics here. There is one subscript, and it is the whole discipline.",
      equations: [
        { label: "Strategy return", latex: "r^{\\text{strat}}_t = w_{t-1} r_t - c\\left|w_{t-1} - w_{t-2}\\right|", note: "The t−1 on the weight is the entire point." },
        { label: "Turnover", latex: "\\text{Turnover} = \\sum_t \\left|w_t - w_{t-1}\\right|", note: "Total capital traded, as a multiple of portfolio value." },
        { label: "Total cost", latex: "\\text{Cost} = c \\times \\text{Turnover}" },
      ],
    },
    whyItWorks: [
      {
        heading: "Why the lag has to be enforced centrally",
        body: "Each strategy computes its signal from data up to day t. If each one also had to remember to shift its own output, one of them eventually would not. applyStrategy applies the shift in a single place, so no individual strategy can get it wrong. The test suite then constructs a series where a same-day signal would guarantee profit and asserts the backtest loses money on it.",
      },
      {
        heading: "Why cost is charged on position change",
        body: "You pay to trade, not to hold. A strategy that goes from cash to fully invested and back pays twice — once each way. Charging on the absolute change makes turnover, not holding period, the quantity that determines total cost, which is the economically correct accounting.",
      },
      {
        heading: "Why the Oracle is not a strategy",
        body: "It uses information that does not exist outside the simulation, so it cannot be run. It is a measurement of the environment: an upper bound on what any regime-timing approach could achieve with perfect information. If the Oracle cannot beat buy-and-hold after costs, nothing that must also estimate the state will.",
      },
    ],
    variables: [
      { symbol: "w_t", meaning: "Exposure held through day t, decided using data up to t−1." },
      { symbol: "c", meaning: "Transaction cost rate, charged on traded notional." },
      { symbol: "\\text{fastWindow}, \\text{slowWindow}", meaning: "Moving-average lengths for the crossover rule." },
      { symbol: "\\text{lookback}", meaning: "Trailing window for momentum and mean-reversion signals." },
    ],
    assumptions: [
      "You can trade at the closing price in unlimited size.",
      "Costs are a flat proportion of notional traded.",
      "No bid-ask spread, no market impact, no slippage, no taxes.",
      "Signals are acted on exactly one period after they are computed.",
      "The strategy's own trading does not move the market.",
    ],
    limitations: [
      "A single market path is one draw. Conclusions that do not survive a seed change are not conclusions.",
      "The cost model is optimistic in every direction, which makes the lab's conclusions about costs understated rather than overstated.",
      "Six strategies are compared and the best highlighted — the best of six noise strategies still looks good, which is a property of taking a maximum.",
    ],
    failureModes: [
      { title: "Look-ahead bias", body: "Writing wₜrₜ instead of wₜ₋₁rₜ makes almost any rule profitable, including pure noise. It fails silently — nothing throws, the equity curve simply rises. This is the single most common backtesting error." },
      { title: "Omitting costs", body: "A strategy turning over 50 times a year at 0.1% must earn 5% before producing anything. Measuring edge at zero cost tells you almost nothing." },
      { title: "A strategy that never trades winning on Sharpe", body: "A rule with no signal sits in cash and scores exactly 0. Against a field of losers, 0 wins. Every candidate in a comparison must actually trade." },
      { title: "Tuning parameters until the result looks good", body: "That is fitting this particular sample. Module 8 quantifies the damage." },
    ],
    beforeMovingOn:
      "That the one-step lag is not a detail but the thing that makes a backtest a measurement rather than a story — and that transaction cost scales with turnover, which is a property of the rule rather than of the market.",
    questions: [
      {
        question: "What is the most common error in backtesting?",
        answer:
          "Look-ahead bias — using information that was not available at the decision point. In code it is the difference between wₜrₜ and wₜ₋₁rₜ: one trades on the very return it is about to earn. It makes almost any rule profitable, including rules built from pure noise, and it fails completely silently. I enforce the lag in a single function so no individual strategy can get it wrong, and I have a test that constructs a series where a same-day signal would guarantee profit and asserts the backtest loses money on it.",
      },
      {
        question: "You found that an Oracle strategy loses to buy-and-hold. What does that mean?",
        answer:
          "The Oracle knows the hidden regime exactly. Before costs it beats buy-and-hold — gross Sharpe 0.491 against 0.447 — so the environment genuinely contains exploitable structure. After 0.1% transaction costs it scores 0.389 against 0.447, so it loses. It traded 93 times over ten years and gave up 13.4% of total return doing it. That means no regime-timing strategy on this market can win at that cost level, because any real agent must also estimate the state imperfectly and pays the same costs. The structure is real and harvesting it costs more than it is worth.",
      },
      {
        question: "How do you know your backtest is not just curve-fitting?",
        answer:
          "Mostly, I do not — which is why I built the Overfitting Lab. The partial defences are: test on a market whose data-generating process I control, so I know whether a signal exists; hold out data and look at it once; report how many parameter combinations were tried; and check that a rule only works in the environment it was designed for. On a random-walk market I can find seeds where a moving-average crossover posts a healthy Sharpe and a smooth equity curve, and I know for certain it is luck because I generated the market.",
      },
    ],
    quiz: [
      "Write out the strategy return equation and explain what each subscript is doing.",
      "A rule trades 30 times a year with a gross edge of 0.08% per trade. At 0.05% cost, what is the net annual return?",
      "Your backtest shows a Sharpe of 2.4 with a very smooth equity curve. Name three things you would check before believing it.",
      "Why does buy-and-hold have essentially zero turnover, and why does that make it a hard benchmark?",
      "A strategy's Sharpe is 0.9 at zero cost and −0.3 at 0.25%. What does that tell you about the rule, and what single number would you look at to confirm it?",
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    module: 8,
    title: "Overfitting and generalisation",
    feature: "Grid search, data splitting, and the generalisation gap",
    files: [
      { path: "app/labs/overfitting/OverfittingLab.tsx", role: "Exhaustive search with train/validation/test splits" },
      { path: "lib/labs/overfitting.ts", role: "The parameter grid" },
    ],
    whatTheCodeDoes:
      "Generates a market with a user-controlled true signal strength — settable to exactly zero. Splits it into three contiguous blocks by time. Searches a grid of moving-average parameters, selecting the winner on training data only. Then evaluates that winner on the held-out test block, and computes the correlation between in-sample and out-of-sample Sharpe across the entire grid.",
    mathematics: {
      intro: "One result explains everything in this module.",
      equations: [
        { label: "Expected maximum of n noisy estimates", latex: "E\\left[\\max_{1 \\le i \\le n} Z_i\\right] \\approx \\sqrt{2\\ln n}", note: "For independent standard normals. Grows without bound as n increases." },
        { label: "Sharpe standard error", latex: "\\text{SE}(\\hat{S}) \\approx \\sqrt{\\frac{1 + S^2/2}{n}}", note: "With n years of data." },
        { label: "Generalisation gap", latex: "G = \\text{Performance}_{\\text{in-sample}} - \\text{Performance}_{\\text{out-of-sample}}" },
      ],
    },
    whyItWorks: [
      {
        heading: "Why the maximum is biased upward",
        body: "When no signal exists, every combination's true Sharpe is zero and each measured Sharpe is a noisy estimate of zero. Taking the maximum does not find the best strategy — there is no best strategy — it finds the estimate with the largest positive error. The expected maximum grows like √(2 ln n), so the inflation increases the harder you search, and it never stops growing.",
      },
      {
        heading: "Why the split must be by time",
        body: "Shuffling a time series before splitting leaks information across the boundary: a randomly chosen test day sits between two training days, and autocorrelation hands the model the answer. Contiguous blocks are the only honest split for sequential data, and getting this wrong is a standard error when people apply general-purpose ML tooling to time series.",
      },
      {
        heading: "Why the −0.005 correlation is the key number",
        body: "Across the whole grid, the correlation between in-sample and out-of-sample Sharpe was −0.005. That says knowing a strategy's historical rank tells you literally nothing about its future rank — not a weakened signal, nothing. It is exactly what theory predicts with no signal, and seeing it hold in a market I wrote myself was more persuasive than reading it.",
      },
    ],
    variables: [
      { symbol: "\\varphi", meaning: "True signal strength. At exactly 0 no rule can have any edge." },
      { symbol: "n", meaning: "Number of parameter combinations searched." },
      { symbol: "G", meaning: "Generalisation gap: in-sample minus out-of-sample performance." },
      { symbol: "\\text{trainFraction}", meaning: "Share of the series used for selection." },
    ],
    assumptions: [
      "The parameter combinations searched are roughly independent — they are not, which makes the √(2 ln n) estimate an upper bound.",
      "The test block is drawn from the same distribution as the training block.",
      "The test set is examined exactly once.",
    ],
    limitations: [
      "The lab is itself an example of the problem: every slider move re-examines the test set, which strictly means it has stopped being one. The page says so about itself.",
      "A single market path. On some seeds the overfit strategy happens to do well out of sample too, and mistaking that for validation is the error the lab is about.",
      "The strongest defence demonstrated here — knowing the ground truth — is unavailable on real data.",
    ],
    failureModes: [
      { title: "Shuffling before splitting", body: "Leaks information across the split through autocorrelation and makes out-of-sample performance look far better than it is." },
      { title: "Reporting the best of many without saying how many", body: "The in-sample score of a selected strategy is biased upward by an amount that grows with the search size, and the search size is almost never disclosed." },
      { title: "Including candidates that do not trade", body: "A rule whose window exceeds the segment generates no signal and scores exactly 0, which can win a comparison among losing strategies." },
      { title: "Treating validation as a second test set", body: "Validation is for choosing between candidates. Once you have chosen, the test set gives you one number, once." },
    ],
    beforeMovingOn:
      "That selecting the maximum of many noisy estimates is biased upward by construction, and that the size of the search determines how much. This is the single most important idea on the site, and Modules 9 and 10 are both special cases of it.",
    questions: [
      {
        question: "What is the difference between overfitting and distribution shift?",
        answer:
          "Overfitting means the model learned noise in the training sample — it would also fail on held-out data from the same period. Distribution shift means the model learned correctly about a world that then changed; it would have passed a proper held-out test at the time and still fails later. They have different fixes: overfitting is addressed by less flexibility, more data and honest validation, while shift is addressed by training across varied environments and testing robustness deliberately. Telling them apart requires a proper out-of-sample test from within the original period.",
      },
      {
        question: "You tested 1,000 strategies on random data. What is the best Sharpe you would expect?",
        answer:
          "With true Sharpe zero for all of them and a standard error around 0.5, the expected maximum of 1,000 draws is about √(2 ln 1000) ≈ 3.7 standard errors, so roughly 1.85. That is an impressive-looking number produced entirely by selection on data with no signal. The decisive missing information when someone reports a strong backtest is how many variants they tried — and it is almost never stated.",
      },
      {
        question: "How do you defend against overfitting in practice?",
        answer:
          "Nothing eliminates it. The partial defences are: hold out data and look at it exactly once; prefer fewer parameters; report the size of the search so the inflation can be estimated; prefer rules with a mechanism you can state in advance over rules found by search; and check that the rule only works in the environment it should. In my own lab the most instructive check was setting the true signal to zero and watching how convincing the fitted noise looked — it calibrates how much scepticism a backtest deserves.",
      },
    ],
    quiz: [
      "You search 400 parameter combinations on 2,000 days of signal-free data. Estimate the best in-sample Sharpe you expect to see.",
      "Explain why shuffling a time series before splitting inflates out-of-sample performance.",
      "A strategy has in-sample Sharpe 1.4 and out-of-sample 1.2. Is this evidence of a real edge? What else would you need to know?",
      "Why does the lab say it is 'itself an example of the problem'?",
      "You have 10 years of daily data and want to test 50 strategies. Describe the protocol you would follow, in order.",
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    module: 9,
    title: "Machine learning",
    feature: "The bias-variance trade-off in a financial setting",
    files: [
      { path: "app/labs/overfitting/OverfittingLab.tsx", role: "The clearest demonstration of the trade-off on the site" },
      { path: "lib/finance/strategies.ts", role: "The hypothesis class being searched over" },
    ],
    whatTheCodeDoes:
      "The grid search in the Overfitting Lab is a machine learning procedure in miniature: a hypothesis class (all moving-average crossovers), a loss function (negative Sharpe on training data), an optimiser (exhaustive search), and a held-out evaluation. Everything that goes wrong with a neural network goes wrong here too, with two parameters instead of two million — which makes the mechanism visible.",
    mathematics: {
      intro: "The decomposition that governs every supervised learning problem.",
      equations: [
        {
          label: "Bias-variance decomposition",
          latex: "E\\left[(y - \\hat{f}(x))^2\\right] = \\underbrace{\\left(\\text{Bias}[\\hat{f}]\\right)^2}_{\\text{too rigid}} + \\underbrace{\\text{Var}[\\hat{f}]}_{\\text{too flexible}} + \\underbrace{\\sigma^2}_{\\text{irreducible}}",
          note: "Total error is minimised somewhere between the two extremes. Finding that point is most of the craft.",
        },
      ],
    },
    whyItWorks: [
      {
        heading: "Why flexibility cuts both ways",
        body: "A model too simple to represent the real relationship has high bias — it is wrong in the same way every time. A model flexible enough to fit anything has high variance — it is wrong in a different way on every sample, because it fits the noise. Increasing capacity trades one for the other, and the sum has a minimum in the middle.",
      },
      {
        heading: "Why finance is a hard setting for this",
        body: "Four problems image recognition does not have. Non-stationarity: the relationship changes, partly because participants adapt to it. Low signal-to-noise: an R² of 0.01 can be economically meaningful. Limited data: roughly 25,000 trading days in a century, and you cannot generate more. And an adversarial system: any edge you find and trade is partly competed away.",
      },
      {
        heading: "Why the irreducible term matters most here",
        body: "In most ML settings σ² is small and progress comes from reducing bias and variance. In markets σ² dominates — most of a return is genuinely unpredictable. That changes the goal from 'fit the data well' to 'extract a small, stable edge without fitting noise', which is a much more defensive discipline.",
      },
    ],
    variables: [
      { symbol: "\\hat{f}", meaning: "The fitted model — here, a selected parameter combination." },
      { symbol: "\\text{Bias}", meaning: "Systematic error from a hypothesis class too rigid to represent the truth." },
      { symbol: "\\text{Var}", meaning: "Sensitivity of the fit to the particular sample drawn." },
      { symbol: "\\sigma^2", meaning: "Irreducible noise. In markets, most of the variance." },
    ],
    assumptions: [
      "Training and deployment data come from the same distribution — which markets violate.",
      "Observations are exchangeable enough for held-out validation to be meaningful.",
      "The loss function reflects what you actually care about.",
    ],
    limitations: [
      "Cross-validation assumes exchangeability and leaks information on time series unless blocked and purged.",
      "More capacity cannot fix a low signal-to-noise ratio; it mostly increases variance.",
      "A model that is right on average can still be unusable if its errors cluster in time, which they do in markets.",
    ],
    failureModes: [
      { title: "Standard k-fold cross-validation on time series", body: "Random folds put future data in the training set. Use contiguous blocks, and purge observations near the boundary." },
      { title: "Optimising a loss that is not the objective", body: "Minimising squared error on returns produces a model that is good at predicting small moves and useless at the ones that matter." },
      { title: "Adding capacity to fix underperformance", body: "If the problem is noise rather than bias, more capacity makes it worse." },
      { title: "Treating feature engineering as free", body: "Every feature tried is another test. Trying 200 features and keeping the best is the same multiple-testing problem as Module 8." },
    ],
    beforeMovingOn:
      "That machine learning in finance is the same mathematics as everywhere else applied in a setting with low signal, limited data, a moving target and an adversary — and that those four conditions, not the algorithms, are what make it hard.",
    questions: [
      {
        question: "Why is machine learning harder in finance than in image recognition?",
        answer:
          "Four reasons. Non-stationarity: a cat looks like a cat forever, but market relationships change, partly because people trade them away. Low signal-to-noise: in images the label is almost fully determined by the pixels, whereas in markets an R² of 0.01 can be meaningful. Limited data: about 25,000 trading days in a century, and you cannot collect more by taking photographs. And the system is adversarial — your own trading erodes the edge. The algorithms transfer; the validation discipline has to be much stricter.",
      },
      {
        question: "Why can you not use standard cross-validation on a time series?",
        answer:
          "Because random folds put future observations into the training set. A test day sitting between two training days is partly determined by them through autocorrelation, so the model effectively sees the answer and out-of-sample performance looks far better than it is. The fix is contiguous blocks in time order, with a purge gap at the boundary so no training observation overlaps the horizon of a test observation. My splits are contiguous for exactly this reason.",
      },
      {
        question: "Your model has 60% directional accuracy. Is that good?",
        answer:
          "Unanswerable without more. Accuracy says nothing about the size of the moves you get right versus wrong — being right on small moves and wrong on large ones loses money at any hit rate. It also says nothing about turnover, and therefore nothing about whether costs consume the edge: a 55% hit rate trading daily at 0.1% cost is exactly break-even. And it says nothing about how many models were tried before this one. I would want the expected return per trade, the turnover, the cost assumption and the size of the search before forming a view.",
      },
    ],
    quiz: [
      "State the bias-variance decomposition and say which term dominates in market prediction.",
      "You add 50 features to a model and in-sample R² rises from 0.02 to 0.30 while out-of-sample stays at 0.01. Diagnose it.",
      "Describe a validation protocol for a daily trading model using 10 years of data. Be specific about the splits.",
      "Why does 'the model is right 60% of the time' not establish that a strategy is profitable?",
      "Give two reasons increasing model capacity could make out-of-sample performance worse.",
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    module: 10,
    title: "Reinforcement learning",
    feature: "The research framework for robustness under distribution shift",
    files: [
      { path: "app/research/rl-market-robustness/page.tsx", role: "The pre-registered experimental design" },
      { path: "lib/finance/strategies.ts", role: "The six baselines, including the Oracle" },
    ],
    whatTheCodeDoes:
      "Nothing yet — and that is deliberate. The framework specifies the environment, state, action space, three reward functions, five distribution shifts, evaluation metrics and six baselines. The agent implementation is not written, and the Results and Interpretation sections are empty. Publishing the design before the results is a form of pre-registration: it prevents the analysis plan being adjusted after the data arrives.",
    mathematics: {
      intro: "The objective an agent maximises, and the quantity this study actually measures.",
      equations: [
        {
          label: "Optimal policy",
          latex: "\\pi^*(s) = \\arg\\max_a\; \\mathbb{E}\\left[\\sum_{t=0}^{\\infty} \\gamma^t R_t \;\\middle|\; s_0 = s, a_0 = a\\right]",
          note: "γ is the discount factor; the expectation runs over the environment's randomness and the policy's own choices.",
        },
        { label: "Raw-return reward (R1)", latex: "R_t = a_{t-1} r_t - c\\left|a_{t-1} - a_{t-2}\\right|" },
        { label: "Risk-adjusted reward (R2)", latex: "R_t = \\frac{a_{t-1}r_t - c\\,\\Delta}{\\hat{\\sigma}_t + \\epsilon}" },
        { label: "Drawdown-aware reward (R3)", latex: "R_t = a_{t-1}r_t - c\\,\\Delta - \\lambda\\max(0, D_t)" },
        { label: "Primary outcome", latex: "G = \\text{Performance}_{\\text{train}} - \\text{Performance}_{\\text{shifted}}", note: "Smaller is more robust." },
      ],
    },
    whyItWorks: [
      {
        heading: "Why reward design is the hard part",
        body: "The agent optimises exactly what you specify, which is rarely exactly what you meant. Reward raw return and it takes maximum exposure. Reward Sharpe and it may avoid volatility even when well compensated. Reward drawdown-adjusted return and it becomes conservative, perhaps excessively. The learning algorithm is largely a solved problem; specifying the objective is not.",
      },
      {
        heading: "Why R2 and R3 need the state extended",
        body: "Both introduce path-dependent terms into the reward, which breaks the Markov property unless the relevant statistic is in the state. R2 needs rolling volatility in the state; R3 needs the current drawdown. Omit them and the agent faces a partially observable problem, so any comparison against R1 is confounded. Recording this before running anything is precisely the point of writing the design down.",
      },
      {
        heading: "Why the Oracle result reframes the whole study",
        body: "On the default environment at 0.1% costs, the Oracle beats buy-and-hold gross and loses net. If that holds across seeds, no agent can beat buy-and-hold by regime timing at that cost level regardless of how well it learns. The experiment would then be measuring robustness among policies that all lose to doing nothing — still a valid question, but a different one, and it has to be stated as such rather than discovered later.",
      },
    ],
    variables: [
      { symbol: "s_t", meaning: "State: last five returns, rolling volatility, current position, rolling return." },
      { symbol: "a_t", meaning: "Action: 0 for cash, 1 for invested. Binary, to avoid the degenerate max-leverage solution." },
      { symbol: "\\gamma", meaning: "Discount factor — how much future reward is worth relative to immediate." },
      { symbol: "\\lambda", meaning: "Drawdown penalty weight in R3, fixed in advance." },
      { symbol: "G", meaning: "Generalisation gap, the primary outcome measure." },
    ],
    assumptions: [
      "The state contains everything decision-relevant, so the problem is Markov.",
      "The environment family is Markov-switching; shifts stay within that family.",
      "The agent's trades do not move the market.",
      "Training and evaluation differ only in the specified shift.",
    ],
    limitations: [
      "Synthetic environments only. Robustness to synthetic shifts is not robustness to real market change.",
      "A small, fully observable state and a binary action space remove most of the decision problem a real agent faces.",
      "The design is 3 × 3 × 5 = 45 cells. Reporting the best cell would be exactly the Module 8 error, so the analysis reports distributions across seeds with the seed count fixed in advance.",
      "No market impact, so a profitable policy's own activity never erodes its edge.",
    ],
    failureModes: [
      { title: "Reward hacking", body: "The agent finds a policy that maximises the reward while violating its intent — maximum leverage under raw return being the simplest example." },
      { title: "Breaking the Markov property through the reward", body: "Path-dependent reward terms require the corresponding statistic in the state, or the comparison is confounded." },
      { title: "Selecting on training performance", body: "If training and robustness rankings coincided, the research question would be uninteresting. H2 states explicitly that they should not." },
      { title: "Reporting the best of 45 cells", body: "The same multiple-testing problem as the Overfitting Lab, with a more impressive-sounding method attached." },
    ],
    beforeMovingOn:
      "That RL does not escape anything from Modules 7 and 8 — it inherits look-ahead risk, cost sensitivity and overfitting, and adds reward specification on top. The reason this study asks about robustness rather than performance is that peak performance in a training environment is the least informative thing an RL agent can produce.",
    questions: [
      {
        question: "Why is reward design the hard part of applying RL to trading?",
        answer:
          "Because the agent is a literal-minded optimiser of exactly what you write down. Reward raw return and it learns maximum exposure, since return is maximised by maximum risk. Reward Sharpe and it may avoid volatility that was well compensated. Reward drawdown-adjusted return and it becomes conservative, possibly to the point of never trading. Each of those is the correct solution to the objective as stated and the wrong solution to the problem you had. The learning algorithm is largely solved; specifying the objective is not.",
      },
      {
        question: "Why are your results sections empty?",
        answer:
          "Because I have not run the experiments. Publishing the design first is a form of pre-registration: once the analysis plan is written down, it cannot be quietly adjusted after the data arrives until the conclusion comes out favourably — which is the main mechanism by which empirical results become unreliable. The hypotheses are stated, including the null, along with what would falsify each. Filling in a results section before running anything would be fabrication, and it would make every other number on the site less trustworthy.",
      },
      {
        question: "What would make you believe an RL trading result?",
        answer:
          "Performance measured net of realistic costs and compared against buy-and-hold, not against zero. Consistency across many seeds, with the distribution reported rather than the best run. Evaluation on environments that differ from training, since peak in-distribution performance is the least informative number an agent can produce. An Oracle baseline establishing that exploitable structure exists at all. And disclosure of how many configurations were tried. Absent those, a strong result is more likely a selected accident than a discovery — which is exactly what my own Overfitting Lab demonstrates on data I know contains no signal.",
      },
    ],
    quiz: [
      "An agent trained with a raw-return reward learns to stay fully invested at all times. Is this a bug? Explain.",
      "Why does a drawdown-aware reward require changing the state representation?",
      "Your agent achieves Sharpe 1.8 in training and 0.2 on a shifted environment. What is the generalisation gap, and what would you try next?",
      "Explain why the Oracle baseline matters more than the buy-and-hold baseline for interpreting an RL result.",
      "You run 45 experimental cells and one shows excellent robustness. What must you report alongside it, and why?",
    ],
  },
  /* ---------------------------------------------------------------- */
  {
    module: 11,
    title: "Statistical inference",
    feature: "The hypothesis-testing layer",
    files: [
      { path: "lib/statistics/inference.ts", role: "t-distribution, t-tests, power, multiple-testing corrections" },
      { path: "lib/math/distributions.ts", role: "logGamma, used by the incomplete beta function" },
      { path: "lib/finance/performance.ts", role: "sharpeRatio, the statistic being tested" },
    ],
    whatTheCodeDoes:
      "incompleteBeta(x, a, b) evaluates the regularised incomplete beta function by Lentz's continued-fraction algorithm. studentTCDF builds the t-distribution CDF on top of it, and studentTInverse inverts that by bisection. oneSampleTTest divides the deviation of the sample mean from the null by the STANDARD ERROR, not the standard deviation, and converts the result to a p-value. power() and requiredSampleSize() answer the question nobody asks before running the test. bonferroni and benjaminiHochberg adjust for having asked many questions at once. sharpeStandardError(S, n) gives the sampling noise in an estimated Sharpe ratio.",
    mathematics: {
      intro:
        "Four separate pieces: the t-statistic, the distribution it follows, the power calculation, and the two multiple-testing corrections — which solve different problems and are not interchangeable.",
      equations: [
        {
          label: "One-sample t-statistic",
          latex: "t = \\frac{\\bar{x} - \\mu_0}{s/\\sqrt{n}}, \\qquad \\nu = n - 1",
          note: "The denominator is the standard error of the MEAN. Using s instead makes every p-value wrong by a factor involving sqrt(n).",
        },
        {
          label: "Student-t CDF via the incomplete beta",
          latex: "F_\\nu(t) = 1 - \\tfrac{1}{2} I_{x}\\!\\left(\\tfrac{\\nu}{2}, \\tfrac{1}{2}\\right), \\quad x = \\frac{\\nu}{\\nu + t^2}",
          note: "For t > 0. The identity is what lets one continued fraction serve the whole distribution.",
        },
        {
          label: "Power",
          latex: "1 - \\beta = \\Phi(\\delta - z_{1-\\alpha/2}) + \\Phi(-\\delta - z_{1-\\alpha/2}), \\quad \\delta = \\frac{\\text{effect}}{\\text{SE}}",
          note: "The probability of detecting an effect that is genuinely there.",
        },
        {
          label: "Standard error of a Sharpe ratio",
          latex: "\\mathrm{SE}(\\hat{S}) \\approx \\sqrt{\\frac{1 + \\tfrac{1}{2}S^2}{n}}",
          note: "n is the number of YEARS. This is the formula that makes most published backtest Sharpes uninterpretable.",
        },
      ],
    },
    whyItWorks: [
      {
        heading: "Why the t-distribution and not the normal",
        body: "If you knew the true standard deviation, the standardised sample mean would be exactly normal. You do not — you estimated it from the same data, and that estimate is itself noisy. Dividing by a random quantity that is sometimes too small produces occasional large statistics, so the distribution has heavier tails than the normal. As n grows the estimate stabilises and the t-distribution converges to the normal, which is why the correction stops mattering past a few hundred observations and matters enormously at twenty.",
      },
      {
        heading: "Why the continued fraction",
        body: "The incomplete beta function has a power-series representation that converges, but slowly and with catastrophic cancellation near the middle of its range. Lentz's method evaluates the continued fraction from the front rather than the back, so it can stop as soon as successive terms stop changing the result, and it never forms the differences that cancel. The code also uses the symmetry I_x(a,b) = 1 - I_{1-x}(b,a) to stay in the half of the domain where convergence is fast.",
      },
      {
        heading: "Why Bonferroni and Benjamini-Hochberg are not alternatives",
        body: "They control different things. Bonferroni controls the probability of making even one false rejection across the whole family — appropriate when a single false positive is expensive. Benjamini-Hochberg controls the expected PROPORTION of rejections that are false — appropriate when you are screening and will follow up on whatever survives. Bonferroni is far more conservative, and on a large family it will reject nothing at all, which is a failure mode rather than a safe default.",
      },
      {
        heading: "Why power is the question that should come first",
        body: "A test that returns 'not significant' has two possible explanations: there is no effect, or there is one and your sample could never have found it. Only a power calculation distinguishes them, and it has to be done before the data, because afterwards the observed effect contaminates it. In finance the arithmetic is brutal — detecting a Sharpe of 0.5 at 80% power takes roughly 30 years of data, which is longer than most strategies, most funds, and most careers.",
      },
    ],
    variables: [
      { symbol: "\\bar{x}", meaning: "Sample mean of the observations." },
      { symbol: "\\mu_0", meaning: "The null value — usually zero, meaning 'no edge'." },
      { symbol: "s", meaning: "Sample standard deviation, with Bessel's correction." },
      { symbol: "\\nu", meaning: "Degrees of freedom, n − 1 for the one-sample test." },
      { symbol: "\\alpha", meaning: "Significance level: the false-positive rate you accept per test." },
      { symbol: "\\delta", meaning: "Effect size measured in standard errors." },
      { symbol: "S", meaning: "Estimated Sharpe ratio, annualised." },
    ],
    assumptions: [
      "Observations are independent. Returns are not, so the effective sample size is smaller than the count.",
      "The sampling distribution of the mean is approximately normal — safe for large n by the central limit theorem, questionable for small n with heavy tails.",
      "The Sharpe standard error formula assumes returns are IID and normal. Both fail for real returns, and the formula understates the true noise when they do.",
      "The hypothesis was fixed before the data were seen.",
    ],
    limitations: [
      "A p-value is the probability of data this extreme IF the null is true. It is not the probability the null is true, and it is not the probability the result will replicate.",
      "Benjamini-Hochberg as implemented assumes the tests are independent or positively dependent. Arbitrary dependence needs the more conservative BY variant.",
      "Nothing here can rescue an analysis where the hypothesis was chosen after looking at the data. The correction counts the tests you declare, not the ones you ran.",
      "Significance says nothing about size. With enough data, an economically meaningless effect becomes significant.",
    ],
    failureModes: [
      {
        title: "Dividing by s instead of s/sqrt(n)",
        body: "The single most common error in applied statistics. It produces a t-statistic smaller by a factor of sqrt(n) and a p-value that looks reassuringly unremarkable. Nothing errors; the test simply loses all its power.",
      },
      {
        title: "Counting tests as one",
        body: "Scanning 200 parameter combinations and reporting the best as p = 0.01 is not a 1% false-positive rate. familyWiseErrorRate(200) returns 0.99997 — under the null you are essentially certain to find something.",
      },
      {
        title: "Treating n as observations rather than years",
        body: "sharpeStandardError takes years. Passing 2,520 daily observations instead of 10 years returns a standard error roughly 16 times too small, turning noise into an apparently decisive result.",
      },
      {
        title: "Interpreting a null result as evidence of absence",
        body: "Without a power calculation, 'not significant' and 'we could not have detected it' are indistinguishable, and in finance the second is usually the true explanation.",
      },
      {
        title: "Silent precision loss near t = 0",
        body: "The identity x = nu/(nu + t^2) rounds to exactly 1.0 in float64 for |t| below about 1e-8, which flattened the CDF into a step. The code special-cases small |t| with a first-order expansion around the density at zero. This returned a plausible 0.5 rather than an error, which is why it survived until a test checked the derivative.",
      },
    ],
    beforeMovingOn:
      "That a p-value answers a narrower question than people want it to, and that the number of hypotheses you tested is part of the result rather than a detail of how you got there. The Overfitting Lab is the same lesson arrived at empirically: across a grid of strategies on data containing no signal at all, the correlation between in-sample and out-of-sample Sharpe comes out at −0.005.",
    questions: [
      {
        question: "Your backtest has a Sharpe of 1.2 over three years. Is it significant?",
        answer:
          "Compute the standard error: sqrt((1 + 0.5 × 1.2²)/3) ≈ 0.76. The t-statistic is 1.2/0.76 ≈ 1.59, which does not clear the usual two-sided threshold. So no — and the more important point is that three years was never enough data to answer the question either way. The 95% interval runs from −0.28 to 2.68, which includes 'this strategy loses money'.",
      },
      {
        question: "Why does Benjamini-Hochberg reject more hypotheses than Bonferroni?",
        answer:
          "Because it controls a weaker, more useful quantity. Bonferroni holds the probability of ANY false rejection below alpha, so its threshold shrinks as alpha/m and becomes vanishing on a large family. Benjamini-Hochberg holds the expected fraction of its rejections that are false below alpha, comparing the i-th smallest p-value against (i/m)·alpha — a threshold that relaxes as evidence accumulates across the family. If you are screening candidates for further testing, tolerating a known fraction of false leads is correct; if one false positive would be published as fact, it is not.",
      },
      {
        question: "You tested 50 strategies and the best has p = 0.008. What can you say?",
        answer:
          "Almost nothing, until the 50 is accounted for. Under the null, the chance of at least one p-value below 0.05 across 50 independent tests is 1 − 0.95⁵⁰ ≈ 92%, so finding something was close to guaranteed. The Bonferroni threshold is 0.001, which 0.008 does not clear. The honest statement is that you ran 50 tests, the best was p = 0.008, and that is consistent with pure chance. The result is a hypothesis to be tested on data you have not touched — not a finding.",
      },
    ],
    quiz: [
      "A colleague reports a t-statistic computed by dividing the mean return by the standard deviation of returns. By what factor is it wrong, and in which direction?",
      "Compute the family-wise error rate for 20 independent tests at alpha = 0.05, and state what it means in words.",
      "Why does the Sharpe ratio standard error depend on the Sharpe ratio itself?",
      "You need to detect a Sharpe of 0.4 at 80% power. Roughly how many years of data does that require, and what does the answer imply about short backtests?",
      "Explain why a power calculation performed after seeing the data is not a power calculation.",
    ],
  },
  /* ---------------------------------------------------------------- */
  {
    module: 12,
    title: "Derivatives",
    feature: "The option pricing layer",
    files: [
      { path: "lib/finance/blackScholes.ts", role: "Closed-form European prices, Greeks, parity, implied volatility" },
      { path: "lib/finance/binomialTree.ts", role: "Cox-Ross-Rubinstein lattice, American exercise, convergence" },
      { path: "lib/math/distributions.ts", role: "normalCDF (Hart) and normalPDF, which the Greeks are built from" },
    ],
    whatTheCodeDoes:
      "blackScholesD computes d1 and d2 once; blackScholes uses them for the price and all five Greeks analytically rather than by finite difference. putCallParityResidual checks an identity that must hold to machine precision. impliedVolatility inverts the price by BISECTION, not Newton. binomialPrice builds a recombining CRR tree, rolls backwards taking max(hold, exercise) at every node when american is true, and refuses to return a number when the risk-neutral probability leaves [0,1]. convergenceProfile prices the same option at increasing step counts so the oscillation toward the closed form is visible.",
    mathematics: {
      intro:
        "One formula, one lattice, and the identity that ties both to no-arbitrage.",
      equations: [
        {
          label: "Black-Scholes-Merton",
          latex: "C = S e^{-qT}\\Phi(d_1) - K e^{-rT}\\Phi(d_2)",
          note: "Phi is the standard normal CDF. The two terms are the discounted expected stock received and cash paid, each under the measure that makes its own numeraire natural.",
        },
        {
          label: "The d terms",
          latex: "d_1 = \\frac{\\ln(S/K) + (r - q + \\tfrac{1}{2}\\sigma^2)T}{\\sigma\\sqrt{T}}, \\qquad d_2 = d_1 - \\sigma\\sqrt{T}",
          note: "Phi(d2) is the risk-neutral probability the call finishes in the money. Phi(d1) is not a probability.",
        },
        {
          label: "Put-call parity",
          latex: "C - P = S e^{-qT} - K e^{-rT}",
          note: "Model-free. It follows from no-arbitrage alone, so any pricer that violates it is wrong regardless of its assumptions.",
        },
        {
          label: "CRR parameters",
          latex: "u = e^{\\sigma\\sqrt{\\Delta t}}, \\quad d = 1/u, \\quad p = \\frac{e^{(r-q)\\Delta t} - d}{u - d}",
          note: "u·d = 1 exactly, which is what makes the tree recombine and the node count O(n²) instead of O(2ⁿ).",
        },
      ],
    },
    whyItWorks: [
      {
        heading: "Why the real drift is absent",
        body: "Nowhere in the formula does the stock's expected return appear. The reason is that the option can be replicated by continuously holding Delta shares and borrowing the rest, and the cost of running that replicating portfolio does not depend on which way you think the stock is going — only on how much it moves. If the option traded away from that cost, you could run the hedge and bank the difference. So the price is pinned by the hedging argument, and the drift is replaced by r.",
      },
      {
        heading: "Why the Greeks are computed analytically",
        body: "Differentiating the formula by hand gives exact derivatives. Finite differences would introduce a step-size tradeoff with no good answer: too large and you measure curvature instead of slope, too small and you subtract two nearly equal numbers and amplify floating-point error. The analytic route also exposed a real bug — the original normal CDF was accurate to only 1.5e-8, which is invisible in a price and became a 3.2e-6 error in the Greeks.",
      },
      {
        heading: "Why bisection for implied volatility",
        body: "Newton's method converges faster and is the obvious choice, and it fails exactly where it matters. The update divides by Vega, and Vega goes to zero for options deep in or deep out of the money — precisely the strikes whose implied volatilities define the wings of the smile. Dividing by a near-zero derivative throws the iterate anywhere. Bisection only needs the price to be monotone in volatility, which it always is, so it is slower and it always converges.",
      },
      {
        heading: "Why the tree can price what the formula cannot",
        body: "Black-Scholes assumes exercise happens at expiry. An American option can be exercised at any time, so its value is the solution to an optimal stopping problem rather than an expectation. The lattice solves that directly: rolling backwards, each node takes max(value of holding, value of exercising now), and the decision propagates. There is no closed form for an American put, which is why the tree exists rather than being a teaching device.",
      },
      {
        heading: "Why an American call on a non-dividend stock is never exercised early",
        body: "Exercising surrenders the remaining time value and pays the strike earlier than necessary. With no dividend there is nothing to gain by owning the stock sooner, so holding dominates at every node and the tree returns exactly the European price. Introduce a dividend large enough and the comparison flips — which is visible in the lab by raising the dividend yield and watching earliestExerciseTime stop being null.",
      },
    ],
    variables: [
      { symbol: "S", meaning: "Spot price of the underlying today." },
      { symbol: "K", meaning: "Strike — the price at which the option may be exercised." },
      { symbol: "T", meaning: "Time to expiry in years." },
      { symbol: "r", meaning: "Continuously compounded risk-free rate." },
      { symbol: "q", meaning: "Continuous dividend yield." },
      { symbol: "\\sigma", meaning: "Volatility — the only input not directly observable, which is why implied volatility exists." },
      { symbol: "\\Delta", meaning: "Delta: shares of stock in the replicating portfolio. Also the hedge ratio." },
      { symbol: "\\Gamma", meaning: "Gamma: how fast Delta changes, so how often the hedge must be rebalanced." },
      { symbol: "p", meaning: "Risk-neutral up probability on the tree. Not the real-world probability." },
    ],
    assumptions: [
      "Geometric Brownian motion: continuous paths, constant volatility, lognormal terminal prices.",
      "Continuous, costless trading — the replication argument needs it, and it is the assumption that fails first.",
      "A single constant volatility across all strikes. The observed smile is direct evidence this is false.",
      "No early exercise, for the closed form. The tree drops exactly this one.",
      "A constant known risk-free rate, and borrowing and lending at the same rate.",
    ],
    limitations: [
      "Constant volatility is wrong in a way that matters: real option markets price a smile, which is the market saying returns have fatter tails than lognormal.",
      "Continuous paths rule out jumps, so the model systematically underprices far out-of-the-money options.",
      "Transaction costs make continuous rebalancing infinitely expensive; real hedging is discrete and imperfect, and the error that introduces is not in the model.",
      "The binomial price oscillates around the true value as steps increase rather than approaching it monotonically, because the strike's position relative to the terminal nodes shifts with the step count.",
      "Greeks are derivatives of a model. If the model is wrong, the hedge ratios it gives you are wrong in the same direction.",
    ],
    failureModes: [
      {
        title: "Newton's method on deep out-of-the-money implied volatility",
        body: "Vega collapses toward zero, the Newton step divides by it, and the iterate diverges or lands on a nonsensical volatility. The failure is silent if the loop reports its last iterate. This is why the code bisects.",
      },
      {
        title: "A time step too coarse for the volatility",
        body: "If exp((r−q)Δt) falls outside [d, u], the risk-neutral probability leaves [0,1] and the lattice admits arbitrage. The code throws with the reason rather than returning a price computed from a negative probability, which would look perfectly ordinary.",
      },
      {
        title: "Reading Phi(d1) as a probability",
        body: "Phi(d2) is the risk-neutral probability of finishing in the money. Phi(d1) is the same probability under a different measure, scaled — it is the Delta, not a probability of anything in the real world. Treating it as one overstates the chance of exercise.",
      },
      {
        title: "Mixing units of time",
        body: "T in days with sigma annualised, or r quoted annually but applied per period, produces a price that is wrong by a large factor while remaining positive and bounded by the parity limits. Nothing catches it except parity residual or a sanity check against the tree.",
      },
      {
        title: "Insufficient Monte Carlo paths with no error bar",
        body: "monteCarloOptionPrice returns a standard error alongside the price precisely so the result cannot be read as exact. Antithetic variates cut that error by pairing each normal draw with its negation, which cancels the sampling noise in the drift.",
      },
    ],
    beforeMovingOn:
      "That the formula is a statement about replication cost, not a forecast — and that the smile is the market's own evidence against the assumption the formula is built on. Both pricers in here agree to six decimal places on a European option, and the tree's extra value on an American put is the price of the right to exercise early, which no closed form will give you.",
    questions: [
      {
        question: "Why does the expected return of the stock not appear in the price?",
        answer:
          "Because the option is replicated by a self-financing portfolio of stock and cash, and the cost of that portfolio depends on how far the stock moves, not on where it is drifting. If two people disagree about the expected return but agree about volatility, they still agree about the replication cost — and if the option traded away from it, either of them could arbitrage it. So the drift is replaced by the risk-free rate, which is not a claim that investors are risk-neutral but a consequence of the hedge existing.",
      },
      {
        question: "Why bisect for implied volatility rather than use Newton?",
        answer:
          "Newton divides by Vega, and Vega vanishes for deep in- and out-of-the-money options. Those are exactly the strikes you most want implied volatilities for, because they define the wings of the smile. Bisection needs only monotonicity of price in volatility, which holds everywhere, so it converges on every input at the cost of more iterations. Robustness beats speed when the fast method fails precisely on the interesting cases.",
      },
      {
        question: "What does the existence of the volatility smile tell you?",
        answer:
          "That the market does not believe the model it is quoting in. If Black-Scholes were right, one volatility would price every strike and the implied surface would be flat. Instead out-of-the-money puts imply higher volatilities, which is the market paying up for protection against moves the lognormal assumption says are essentially impossible. The smile is the model's error made visible and quoted, and 'implied volatility' is best read as the number that makes a known-wrong formula produce the right price.",
      },
    ],
    quiz: [
      "An American call on a stock paying no dividend is worth exactly the European call. Explain why, in terms of what exercising early gives up.",
      "You price a put and a call on the same underlying and strike, and the parity residual is 0.4. Which of your two prices is wrong, and how would you find out?",
      "Gamma peaks near the money and close to expiry. What does that imply for someone running a delta hedge on an option about to expire at the strike?",
      "Doubling the steps in a binomial tree does not halve the pricing error, and the error changes sign. Explain the oscillation.",
      "Vega goes to zero for a deep out-of-the-money option. State the consequence for implied volatility, and the consequence for anyone trading that option on a volatility view.",
    ],
  },
  /* ---------------------------------------------------------------- */
  {
    module: 13,
    title: "Fixed income and credit",
    feature: "The discounting and default layer",
    files: [
      { path: "lib/finance/fixedIncome.ts", role: "Cash flows, pricing, yield, duration, convexity, curves, forwards" },
      { path: "lib/finance/credit.ts", role: "Merton structural model, spreads, implied asset volatility" },
      { path: "lib/finance/blackScholes.ts", role: "Reused directly — the Merton model is Black-Scholes on the firm" },
    ],
    whatTheCodeDoes:
      "bondCashFlows counts BACKWARDS from maturity so the final payment lands exactly on the maturity date rather than accumulating rounding across sixty coupons. presentValue discounts at the periodic rate; yieldToMaturity inverts it by bisection. bondRiskMeasures returns Macaulay and modified duration, convexity and DV01 from a single pass over the flows. nelsonSiegel builds a curve from level, slope and curvature; forwardRate extracts the implied future rate by no-arbitrage. mertonModel prices the firm's equity as a CALL on its assets struck at the face value of its debt, and reads the default probability and credit spread off the same d-terms.",
    mathematics: {
      intro:
        "Discounting, its first two derivatives, and the reframing that turns a credit question into an option question.",
      equations: [
        {
          label: "Bond price",
          latex: "P = \\sum_{i=1}^{n} \\frac{C/f}{(1 + y/f)^{f t_i}} + \\frac{F}{(1 + y/f)^{f T}}",
          note: "Everything else in this module is a derivative of this expression with respect to y.",
        },
        {
          label: "Macaulay and modified duration",
          latex: "D = \\frac{\\sum t_i\\, \\mathrm{PV}(CF_i)}{P}, \\qquad D_{\\text{mod}} = \\frac{D}{1 + y/f}",
          note: "D is the present-value-weighted average time to payment — the balance point of the cash flows.",
        },
        {
          label: "Second-order price change",
          latex: "\\frac{\\Delta P}{P} \\approx -D_{\\text{mod}}\\,\\Delta y + \\tfrac{1}{2} C (\\Delta y)^2",
          note: "The duration term is a tangent line. Because the price-yield curve is convex, that line sits below the truth on BOTH sides.",
        },
        {
          label: "No-arbitrage forward rate",
          latex: "(1 + y_2)^{t_2} = (1 + y_1)^{t_1}\\,(1 + f_{1,2})^{t_2 - t_1}",
          note: "Lending once to t2 must equal lending to t1 and rolling. Otherwise the two strategies are an arbitrage.",
        },
        {
          label: "Merton: equity as a call on the firm",
          latex: "E_0 = V_0\\,\\Phi(d_1) - D e^{-rT}\\Phi(d_2), \\qquad E_T = \\max(V_T - D, 0)",
          note: "Limited liability IS the option. Shareholders own the upside above the debt and can walk away below it.",
        },
      ],
    },
    whyItWorks: [
      {
        heading: "Why duration is a time and a sensitivity at once",
        body: "Differentiate the price with respect to y. Every term (1 + y/f)^(−f·t) brings down a factor of −t/(1 + y/f), so the derivative is the present-value-weighted average of the times, divided by (1 + y/f). That weighted average is a number of years with a real physical meaning — the balance point of the cash flows on a time axis — and it is simultaneously the percentage price move per unit of yield. The two readings are the same arithmetic seen from either end.",
      },
      {
        heading: "Why convexity is desirable rather than a correction",
        body: "The price-yield relationship curves upward. A straight-line duration estimate therefore understates the price whether yields rise or fall: you lose less than duration predicts when rates rise, and gain more when they fall. That asymmetry is free, so convexity is something to own, and two bonds with identical duration are not interchangeable.",
      },
      {
        heading: "Why cash flows are counted backwards",
        body: "A 30-year semiannual bond has 60 coupons. Stepping forward by 0.5 from issue accumulates floating-point error and leaves the final principal payment slightly off the maturity date, which shifts duration by a visible amount. Counting back from maturity pins the one date that must be exact and pushes any residue to the nearest coupon, where it is immaterial.",
      },
      {
        heading: "Why equity is an option",
        body: "A shareholder in a limited-liability firm receives whatever remains after creditors are paid, and nothing if that is negative — they cannot be pursued for the shortfall. The payoff max(V_T − D, 0) is exactly a call option on the firm's assets struck at the face value of its debt. So Black-Scholes prices the equity, the debt is the residual V − E, and the default probability is Phi(−d2). The entire credit model is one substitution away from the option model.",
      },
      {
        heading: "Why equity volatility exceeds asset volatility",
        body: "Equity is a levered claim. Its volatility is sigma_V multiplied by the elasticity of the equity value with respect to the assets, which is (V/E)·Phi(d1) — greater than one whenever there is debt outstanding. In the lab a 25% asset volatility produces a 48.7% equity volatility, and the whole of that gap is leverage. It also runs the other way: the observable quantity is equity volatility, so impliedEquityVolatility exists to recover the asset volatility you cannot see.",
      },
    ],
    variables: [
      { symbol: "y", meaning: "Yield to maturity: the single rate that makes the discounted flows equal the price." },
      { symbol: "f", meaning: "Coupon frequency per year, usually 2." },
      { symbol: "D", meaning: "Macaulay duration in years — or, in the Merton section, the face value of debt." },
      { symbol: "C", meaning: "Convexity — or the annual coupon, depending on the equation. The notation collides and the code does not." },
      { symbol: "V_0", meaning: "Market value of the firm's assets today." },
      { symbol: "\\sigma_V", meaning: "Asset volatility — unobservable, which is the central difficulty of the model." },
      { symbol: "\\Phi(-d_2)", meaning: "Risk-neutral default probability." },
    ],
    assumptions: [
      "A single yield discounts every cash flow, which is why yield to maturity is a summary rather than a model of the curve.",
      "Coupons are reinvested at the yield — the reinvestment assumption buried inside YTM.",
      "Nelson-Siegel curves are smooth in three factors. Real curves are not always.",
      "Merton: the firm's assets follow geometric Brownian motion, there is a single zero-coupon debt issue, and default can only occur at maturity.",
      "No taxes, no bankruptcy costs, and no renegotiation.",
    ],
    limitations: [
      "Duration and convexity describe a PARALLEL shift. The PCA lab shows that level explains 96.5% of real curve variation — but the remaining slope and curvature moves are exactly the ones a duration hedge does not see.",
      "Merton's default can only happen at maturity, so short-maturity credit spreads collapse toward zero. Observed short spreads do not, which is the model's most famous failure and good evidence that firms fail through jumps rather than a slow diffusion.",
      "Asset value and asset volatility are both unobservable and must be backed out of equity, so the model's two most important inputs are estimates with their own error.",
      "The risk-neutral default probability exceeds the real-world one — 23.69% against 14.14% in the lab's default case — because it carries a risk premium. Reading it as a forecast of actual defaults overstates them substantially.",
    ],
    failureModes: [
      {
        title: "Mixing annual and periodic rates",
        body: "Discounting a semiannual coupon at the annual yield, or dividing by f twice, produces a price that is plausible and wrong. Duration moves with it, so nothing looks inconsistent internally.",
      },
      {
        title: "Hedging duration and calling it hedged",
        body: "A duration-neutral book is immunised against a parallel shift and nothing else. A steepening leaves it exposed, and the exposure is invisible in every duration report it produces.",
      },
      {
        title: "Using duration alone for a large yield move",
        body: "The tangent-line estimate understates the price in both directions, so a 200bp shock looks worse than it is on a long bond. approximatePriceChange exists to show the gap against the exact repricing.",
      },
      {
        title: "Reading risk-neutral default probability as the real one",
        body: "They differ by a risk premium and the gap is large. Capital decisions made on the risk-neutral number are systematically too conservative; pricing decisions made on the real-world number are systematically too cheap.",
      },
      {
        title: "Forward rates read as forecasts",
        body: "The forward rate is the rate that makes two lending strategies cost the same today. It is a no-arbitrage construction, not a prediction, and it is a poor one empirically.",
      },
    ],
    beforeMovingOn:
      "That the entire module is one expression — the discounted sum — and its first two derivatives, and that the step from a certain cash flow to an uncertain one is a change of claim rather than a change of mathematics. The arithmetic check worth remembering: in the Credit Lab the equity value of $46.16 and the debt value of $53.84 add to exactly the $100 firm value, because the two claims partition the firm and nothing else can be true.",
    questions: [
      {
        question: "Two bonds have the same duration but different convexity. Which would you rather own, and what should it cost?",
        answer:
          "The more convex one, and it should cost more. Equal duration means equal first-order sensitivity, so they move together for small yield changes. For large moves in either direction the convex bond does better — it falls less when yields rise and gains more when they fall. That is a one-sided advantage, so it is not free, and the price difference is what you pay for it. The catch is that convexity is most valuable when yields move a lot, so you are buying volatility exposure and should price it accordingly.",
      },
      {
        question: "Why do Merton credit spreads go to zero at short maturities, and why does that matter?",
        answer:
          "Because asset value diffuses continuously. Over a very short horizon, a firm whose assets exceed its debt today essentially cannot reach the default boundary, so the risk-neutral default probability and the spread both vanish. Real short-dated spreads are clearly positive. The discrepancy is informative rather than embarrassing: it says real firms default through sudden events — fraud discovered, a covenant breached, funding withdrawn — that a continuous path cannot produce. It is the main argument for jump-diffusion and reduced-form credit models.",
      },
      {
        question: "Your equity volatility is 48.7% and the model says asset volatility is 25%. Where did the rest come from?",
        answer:
          "Leverage, entirely. Equity is a call on the assets, so its volatility is the asset volatility times the elasticity (V/E)·Phi(d1), which exceeds one whenever debt exists. No extra business risk is being added — the same asset uncertainty is concentrated into a smaller, junior claim. The practical consequence is that equity volatility is not a property of the business alone, and comparing it across firms with different capital structures compares their balance sheets as much as their operations.",
      },
    ],
    quiz: [
      "A 10-year bond has modified duration 8.2 and convexity 85. Estimate the price change for a +150bp move, with and without the convexity term, and say which is closer to the truth.",
      "Why does a zero-coupon bond have Macaulay duration exactly equal to its maturity, while a coupon bond's is always less?",
      "The 2-year yield is 4% and the 5-year is 4.6%. Compute the implied 2y-into-5y forward rate, then explain why it is not a forecast.",
      "A firm's assets are worth $100 and its debt has face value $80 due in five years. State the equity payoff at maturity in both the solvent and insolvent cases, and name the option it matches.",
      "Your bond book is duration-neutral and loses money on a day when the curve steepens and the 10-year yield is unchanged. Explain how, and what measure would have shown the exposure.",
    ],
  },
];

export function getTeachingNote(module: number): TeachingNote | undefined {
  return TEACHING_NOTES.find((note) => note.module === module);
}
