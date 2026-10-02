# QuantLab

**Experiment with the mathematics behind markets.**

An interactive laboratory for probability, statistics, portfolio theory, market simulation, risk and
quantitative research. Ten labs, 28 lessons, and a research framework — all computing in the browser,
all reproducible from a seed.

> **Educational disclaimer.** QuantLab is an educational and research platform. The simulations and
> models shown here are simplified representations of financial markets and should not be interpreted
> as investment advice. Nothing on this site predicts market prices. All data is synthetic.

---

## What this is

Not a stock-market website. There are no live prices, no news feed, and no recommendations.

The organising question is deliberately different from the usual one:

> Instead of asking which stock will go up, QuantLab asks how mathematical models behave, what
> assumptions they depend on, and when those assumptions break.

Every lab follows the same nine-part structure, enforced by the component that renders it rather than
by convention — so no lab can quietly omit its assumptions or its limitations:

**Question → Inputs → Model → Assumptions → Simulation → Visualisation → Results → Interpretation → Limitations**

## Three properties the whole project is built around

**Everything is computed.** There are no hard-coded results anywhere in this repository. Every
statistic is calculated in the browser from the parameters you set, by functions covered by a suite of
numerical tests that check them against known analytic values.

**Everything is reproducible.** Every experiment exposes its random seed and complete configuration.
Copy it, share it as a URL, or export it as JSON — the identical experiment runs again and produces
identical numbers.

**Nothing is predicted.** These models describe how mathematical processes behave, not what markets
will do. Where a model fails, the lab says so explicitly and at length.

---

## Results this platform actually produced

These came out of the code in this repository, at the stated seeds, and are regenerable from the
corresponding labs. They are listed here because they are the point of the project.

| Finding | Measurement |
| --- | --- |
| On a market with **zero** autocorrelation, grid search produced a strong in-sample result that vanished out of sample | In-sample Sharpe **0.557**, out-of-sample **−0.890**. Correlation between in-sample and out-of-sample Sharpe across the grid: **−0.005** |
| An **Oracle** that knows the hidden regime beats buy-and-hold before costs and loses after | Gross Sharpe 0.491 vs 0.447; net of 0.1% costs, 0.389 vs 0.447 |
| A regime detector can be **useful while scoring worse than guessing** | Accuracy 41.6% vs a 45.7% majority baseline, but bear-regime recall 50.7% against a 23% base rate |
| Parametric VaR's error against historical VaR **changes sign** with confidence level on fat-tailed data | Overstates at 90–95%, understates at 99% |
| The Itô correction is correctly implemented | Mean terminal price matches `S₀e^(μT)`; pooled z-score across ten seeds: **−1.07** |

The experiment log at `/research/experiment-log` records all of these, plus three experiments that
failed or needed revision. Failed experiments stay visible.

---

## Features

### Ten laboratories

| Lab | Level | What it demonstrates |
| --- | --- | --- |
| **Monte Carlo Simulator** | 2 | GBM path simulation, the Itô correction, volatility drag, ending-price distributions |
| **Market Regime Simulator** | 3 | Markov switching, hidden-state inference, where fat tails and volatility clustering come from |
| **Portfolio Optimizer** | 2 | Mean-variance optimisation, the efficient frontier, risk contribution, estimation instability |
| **Risk Analyzer** | 2 | Six risk measures compared, three VaR methods, VaR backtesting |
| **Backtesting Lab** | 3 | Five strategies plus an Oracle, the one-step lag, how transaction costs destroy an edge |
| **Overfitting Lab** | 3 | Grid search on signal-free data, the generalisation gap, multiple testing |
| **Options Lab** | 3 | Black-Scholes, all five Greeks, Monte Carlo convergence, put-call parity |
| **Correlation Lab** | 1 | The covariance cross term, the perfect hedge at ρ = −1 |
| **Probability Playground** | 1 | Law of large numbers, central limit theorem, Bayes with natural frequencies |
| **Random Walk vs Structure** | 2 | Four processes, autocorrelation of returns vs squared returns |

### Learn, research and reference

- **28 lessons** across **10 modules** in dependency order, each with a definition, intuition,
  formula, worked example, and a link to the lab that demonstrates it.
- **10 code walkthroughs** — one per module — covering what the code does, why the mathematics
  works, every variable, the failure modes that return a plausible wrong answer rather than an
  error, three questions you should be able to answer aloud with model answers, and a quiz.
- **A pre-registered research framework** for studying RL robustness under distribution shift, with
  the results sections deliberately empty.
- **An experiment log** including failures, a **research journal**, **10 original challenges** with
  full worked solutions, a **48-term glossary**, and a **references page** with verification status
  marked honestly.

### Research Mode

A toggle in the header. Off, the labs are beginner-friendly. On, every lab additionally reveals its
exact equations, assumptions, raw statistics, full parameter tables, and analytic-versus-simulated
comparisons. The rigorous material is always in the page — Research Mode only unfolds it.

---

## Architecture

```
quantlab/
├── app/                        # Next.js App Router
│   ├── labs/<slug>/            # One directory per lab: page.tsx (server) + Lab.tsx (client)
│   ├── learn/[slug]/           # Lesson pages, statically generated
│   ├── learn/notes/[module]/   # Per-module code walkthroughs
│   ├── research/               # RL framework, experiment log, journal
│   └── …                       # about, projects, challenges, glossary, references
├── components/
│   ├── charts/                 # Reusable Recharts wrappers + heatmap
│   ├── labs/                   # ExperimentSection, LabShell, ReproducibilityPanel
│   ├── math/                   # KaTeX rendering with symbol legends
│   ├── providers/              # Theme and Research Mode context
│   └── ui/                     # Cards, controls, tables, states
├── content/                    # Lab registry, lessons, teaching notes, glossary, challenges, journal
├── lib/
│   ├── charts/                 # Largest-Triangle-Three-Buckets downsampling
│   ├── experiment/             # Config serialisation, URL encoding, CSV/JSON export
│   ├── finance/                # Performance metrics, Black-Scholes, portfolio theory, strategies
│   ├── hooks/                  # Cooperative batching for long simulations
│   ├── labs/                   # Per-lab parameter schemas (shared by server and client)
│   ├── math/                   # RNG, distributions, linear algebra
│   ├── simulation/             # GBM, AR(1), OU, jump diffusion, regime switching
│   └── statistics/             # Descriptive statistics
└── tests/                      # 272 numerical tests
```

### Two architectural decisions worth explaining

**Parameter schemas live in `lib/labs/`, not in the lab components.** When a Next.js server component
imports a value from a `"use client"` module, the value is replaced by a client reference proxy rather
than the actual data. Shared plain data therefore needs its own non-client module. This was found the
hard way — every lab's defaults silently arrived as `undefined`.

**Long simulations yield cooperatively.** A 50,000-path Monte Carlo is ~13 million random draws. In a
single synchronous loop that freezes the tab, and `startTransition` does not help — React can
deprioritise a render but cannot interrupt a `for` loop. `useBatchedSimulation` processes a batch,
yields to the event loop, then continues, with a cancellation token so that changing a slider abandons
the obsolete run instead of finishing it.

---

## Mathematical models implemented

| Area | Implementation |
| --- | --- |
| **Random generation** | mulberry32 PRNG, Box-Muller normals with spare caching, discrete sampling |
| **Distributions** | Normal PDF; CDF via Hart's rational approximation (~1e-15); inverse CDF via Acklam (~1.15e-9); log-gamma via Lanczos; binomial |
| **Processes** | Geometric Brownian motion (exact solution), AR(1) with variance-preserving rescaling, Ornstein-Uhlenbeck (exact discretisation), Merton jump diffusion, three-state Markov switching |
| **Statistics** | Mean, median, variance, standard deviation, skewness, excess kurtosis (both bias-corrected), percentiles by linear interpolation, covariance, correlation, autocorrelation, rolling windows |
| **Performance** | Simple and log returns, CAGR, annualised volatility, Sharpe, Sortino, Calmar, downside deviation, max drawdown with peak attribution, hit rate, profit factor, beta |
| **Risk** | Historical, parametric and Monte Carlo VaR; conditional VaR; parametric CVaR in closed form |
| **Derivatives** | Black-Scholes-Merton with dividends, all five Greeks, implied volatility by bisection, Monte Carlo pricing with antithetic variates |
| **Portfolio** | Quadratic forms, Cholesky decomposition, Gaussian elimination with partial pivoting, closed-form minimum-variance and tangency portfolios, exact efficient frontier via Lagrangian, Euler risk decomposition |

### Three implementation details that are easy to get wrong

**The Itô correction.** `S(t+Δt) = S(t)·exp[(μ − σ²/2)Δt + σ√Δt·Z]`. The `−σ²/2` term is not a fudge
factor — without it, `E[S_T] ≠ S₀e^(μT)` and volatility manufactures free expected growth. A test
asserts the identity across 60,000 paths.

**Maximum drawdown's peak attribution.** The algorithm must record the peak that was *in force at the
time* of the worst decline, not the series' global maximum. A test case where the worst drawdown
precedes the all-time high catches the naive implementation.

**The one-step position lag.** `r_strategy[t] = w[t−1]·r[t]`. Using `w[t]` is look-ahead bias, and it
fails silently — the equity curve simply rises. A test constructs a series where a same-day signal
would guarantee profit and asserts the backtest *loses* money on it.

---

## Installation

Requires Node 18.18+ (developed on Node 22).

```bash
git clone <repository-url>
cd quantlab
npm install
```

## Development

```bash
npm run dev          # Development server at http://localhost:3000
npm run build        # Production build
npm start            # Serve the production build
npm run typecheck    # TypeScript, no emit
npm test             # Run the numerical test suite
npm run test:watch   # Tests in watch mode
```

---

## Testing

272 tests across 8 files, all numerical. The suite checks three kinds of thing:

**Known analytic values.** Black-Scholes reproduces the canonical textbook case (call `10.450584`,
put `5.573526`) to six decimal places. The normal CDF matches published standard-normal values to ten
decimals. Hand-computable variances and percentiles match NumPy's conventions exactly.

**Mathematical invariants.** Variance is never negative. Correlation of an array with itself is
exactly 1. Portfolio weights sum to 1. Put-call parity holds to 1e-8 across five parameter sets. Call
delta minus put delta equals `e^(−qT)`. Gamma and vega are identical for calls and puts. Every Greek
matches a central finite difference. No portfolio on the efficient frontier is dominated by another.

**Statistical properties with principled tolerances.** Where a test compares a simulation against
theory, the tolerance is derived from the sampling error — typically four standard errors — rather
than from an arbitrary decimal place. A fixed tolerance tighter than the sampling error fails on
unlucky seeds even when the code is correct, which produces flaky tests and, worse, teaches you to
ignore them.

```bash
npm test
```

---

## Accessibility

Audited rather than assumed. Every interactive control has a programmatic label, every chart carries a
written text alternative via `role="img"` and `aria-label`, tab lists implement arrow-key navigation
per the WAI-ARIA pattern, and no information is conveyed by colour alone — correlation heatmaps print
the value in every cell, and chart legends pair colour with a line style.

Palette contrast was computed rather than eyeballed. The audit found `--ink-faint` failing WCAG AA for
normal text in both themes (3.30–4.19 against a 4.5 requirement) while being used for 11px footnotes;
both values were corrected, and the whole palette now clears 4.5:1 on every surface it is used against.

A second finding: the `Toggle` component used `<label for>` pointing at a `<button>`. That is
technically permitted, but accessible-name computation for it is inconsistent across screen readers,
and an unnamed switch is announced as just "switch". It now uses `aria-labelledby`.

---

## Research methodology

The research section is structured so that experimental design is published *before* results exist.
This is a form of pre-registration: specifying the analysis plan in advance prevents the most common
failure in empirical research, which is adjusting the design after seeing the data until the
conclusion comes out favourably.

Accordingly, `/research/rl-market-robustness` has a complete specification — research question,
hypotheses (including the null), state and action spaces, three reward functions, five distribution
shifts, evaluation metrics, six baselines — and **empty results and interpretation sections**. They
will stay empty until the experiments are run.

Throughout the site, four things are kept visually and verbally distinct:

- **Observation** — what the numbers say
- **Interpretation** — what they appear to mean
- **Conclusion** — what is being claimed
- **Limitation** — why the claim might be wrong

Collapsing these is how "the backtest returned 40%" becomes "this strategy makes 40%".

---

## Limitations

**All data is synthetic.** This is deliberate, not a shortcut: when you generate the market, you know
the true data-generating process and can check whether a method recovers it. But it means every
result is a statement about a model, not about any real market.

**Every model here is wrong in known ways.** GBM has constant volatility and no jumps. The portfolio
optimiser assumes parameters are known exactly. Black-Scholes assumes continuous costless hedging. The
regime model assumes a fixed number of states with constant transition probabilities. Each lab's
Assumptions and Limitations sections enumerate these.

**Single-path results are noisy.** Most labs show one realisation. Conclusions that do not survive a
seed change are not conclusions, and the labs say so.

**The test set gets reused.** The Overfitting Lab's own test set is re-examined every time you move a
slider, which strictly means it has stopped being a test set. The lab states this about itself.

**The cost model is optimistic.** Flat proportional costs, no bid-ask spread, no market impact, no
slippage, no taxes. Real costs are worse, which makes the lab's conclusions about transaction costs
understated rather than overstated.

---

## Roadmap

**Done** — design system, navigation, all ten labs, 28 lessons, 10 code walkthroughs, glossary,
challenges, research framework, experiment log, journal, Research Mode, reproducibility layer,
sitemap and robots, WCAG AA contrast throughout, 272 tests.

**Next** — ARIMA and GARCH volatility modelling; hidden Markov models fitted by Baum-Welch (to
quantify how much of the Oracle gap is state estimation versus policy learning); PCA and factor
models; CAPM and Fama-French; the RL agent implementation and training loop; CSV upload for
user-supplied data.

**Later** — pairs trading and cointegration; Kalman filters; neural network function approximation;
market microstructure and order-book simulation; stochastic calculus notes.

The architecture anticipates these: generators share one interface, strategies share one signature,
and the chart components are model-agnostic.

---

## Contributing

This is a personal learning project. If you find a mathematical error, that is the most valuable
possible contribution — please open an issue with the specific calculation and the correct value.

---

## License

MIT.

---

## A closing note on what this project is for

The most useful thing in this repository is not any individual lab. It is the `−0.005` correlation
between in-sample and out-of-sample Sharpe ratios on a market built to contain no signal at all.

That number is only meaningful because the market was generated by code in this repository, so there
is no doubt whatsoever about whether a signal existed. On real data that certainty never exists, which
is exactly why it is so easy to mistake a selected accident for a discovery — and why learning to
recognise the pattern on synthetic data first is worth the effort.
