import Link from "next/link";
import { PageHeader, Section } from "@/components/PageHeader";
import { Card, CardBody, Badge, Callout } from "@/components/ui";

export const metadata = {
  title: "Projects",
  description: "The components of QuantLab, with their research questions, methods, current status and results.",
};

type Status = "Built and tested" | "Framework only" | "Planned";

const STATUS_TONE: Record<Status, "positive" | "caution" | "neutral"> = {
  "Built and tested": "positive",
  "Framework only": "caution",
  Planned: "neutral",
};

interface Project {
  name: string;
  question: string;
  description: string;
  methods: string[];
  technologies: string[];
  results: string;
  status: Status;
  href?: string;
}

const PROJECTS: Project[] = [
  {
    name: "Monte Carlo market simulator",
    question: "What distribution of outcomes does geometric Brownian motion imply, and does the simulation match the closed-form solution?",
    description:
      "Simulates up to 50,000 GBM paths with streaming statistics, so large runs never hold more than the terminal values in memory. Compares every simulated statistic against the analytic result.",
    methods: ["Exact GBM discretisation", "Seeded Box-Muller sampling", "Streaming terminal statistics", "Percentile bands"],
    technologies: ["TypeScript", "Recharts", "Cooperative batching"],
    results:
      "Mean terminal price matches S₀e^(μT) within sampling error across ten seeds; pooled z-score −1.07, no detectable bias. Confirms the Itô correction is correctly implemented.",
    status: "Built and tested",
    href: "/labs/monte-carlo",
  },
  {
    name: "Market regime simulator",
    question: "How much hidden regime structure can be recovered from observable data, and how does that depend on regime persistence?",
    description:
      "A three-state Markov-switching market with a user-controlled transition matrix, plus a volatility-and-return threshold detector scored against the known hidden states.",
    methods: ["Markov chain simulation", "Stationary distribution by power iteration", "Confusion-matrix evaluation"],
    technologies: ["TypeScript", "Recharts"],
    results:
      "Detector accuracy 41.6% against a 45.7% majority-class baseline, but bear-regime recall of 50.7% against a 23% base rate. Demonstrates that accuracy is the wrong metric for imbalanced classification.",
    status: "Built and tested",
    href: "/labs/market-regimes",
  },
  {
    name: "Portfolio optimizer",
    question: "How much of achievable risk reduction comes from correlation structure rather than from asset selection?",
    description:
      "Mean-variance optimisation over four synthetic assets, with closed-form minimum-variance and tangency portfolios, an exactly-solved efficient frontier, and risk-contribution decomposition.",
    methods: ["Quadratic forms", "Lagrangian optimisation", "Gaussian elimination with partial pivoting", "Cholesky decomposition", "Euler risk decomposition"],
    technologies: ["TypeScript", "Custom linear algebra"],
    results:
      "At default parameters, a 30/30/25/15 allocation achieves 12.15% volatility against a 16.65% weighted average — a 27% reduction attributable entirely to the covariance structure.",
    status: "Built and tested",
    href: "/labs/portfolio-optimizer",
  },
  {
    name: "Risk analyzer",
    question: "When do six different risk measures disagree, and what does each disagreement reveal?",
    description:
      "Computes volatility, downside deviation, drawdown, Sharpe, Sortino, Calmar, VaR and CVaR on four return processes calibrated to identical volatility, plus a VaR backtest.",
    methods: ["Historical, parametric and Monte Carlo VaR", "Expected shortfall", "Single-pass drawdown with peak attribution", "VaR breach backtesting"],
    technologies: ["TypeScript", "Hart's normal CDF", "Acklam's inverse CDF"],
    results:
      "On Student-t innovations, parametric VaR overstates risk at 90–95% confidence and understates it at 99% — the sign of the error flips, which a single-confidence-level test would miss entirely.",
    status: "Built and tested",
    href: "/labs/risk-analyzer",
  },
  {
    name: "Backtesting engine",
    question: "How much of a strategy's apparent edge survives realistic transaction costs?",
    description:
      "Six strategies including an Oracle baseline, run against four market processes with a strictly enforced one-step position lag and cost charged on turnover.",
    methods: ["Signal generation with enforced lag", "Turnover-based cost accounting", "Oracle baseline", "Cost sensitivity analysis"],
    technologies: ["TypeScript", "Vitest"],
    results:
      "The Oracle, which knows the hidden regime exactly, beats buy-and-hold before costs (Sharpe 0.491 vs 0.447) and loses to it after 0.1% costs (0.389 vs 0.447). Perfect information is not sufficient.",
    status: "Built and tested",
    href: "/labs/backtesting",
  },
  {
    name: "Overfitting laboratory",
    question: "How large an apparent edge does a parameter search manufacture on data containing no signal?",
    description:
      "Exhaustive grid search over moving-average parameters with contiguous train/validation/test splits, scoring every combination on all three so the in-sample to out-of-sample relationship is visible.",
    methods: ["Grid search", "Time-ordered data splitting", "Generalisation gap measurement", "Multiple-comparisons analysis"],
    technologies: ["TypeScript", "Recharts"],
    results:
      "On a market with φ = 0 exactly, the best in-sample Sharpe was 0.557 and its out-of-sample Sharpe −0.890. Correlation between in-sample and out-of-sample Sharpe across the grid: −0.005.",
    status: "Built and tested",
    href: "/labs/overfitting",
  },
  {
    name: "Options pricing laboratory",
    question: "Does a simulation that knows nothing about Black-Scholes converge to the Black-Scholes price?",
    description:
      "Analytic European option pricing with all five Greeks, alongside Monte Carlo pricing with antithetic variates and a convergence trace.",
    methods: ["Black-Scholes-Merton", "Risk-neutral Monte Carlo", "Antithetic variates", "Bisection implied volatility"],
    technologies: ["TypeScript", "Vitest"],
    results:
      "Reproduces the canonical textbook values (call 10.450584, put 5.573526) to six decimal places. Put-call parity residual below 1e-8. All Greeks match central finite differences.",
    status: "Built and tested",
    href: "/labs/options",
  },
  {
    name: "RL market robustness study",
    question: "Which reward design produces agents that degrade least when market conditions shift away from training?",
    description:
      "A pre-registered experimental design: three reward functions × three cost conditions × five distribution shifts, with six baselines including an Oracle.",
    methods: ["Markov-switching environments", "Pre-specified hypotheses", "Generalisation gap as primary outcome", "Multi-seed evaluation"],
    technologies: ["Design stage — agent implementation not yet written"],
    results:
      "None. No agent has been trained. The design is published; the results sections are deliberately empty.",
    status: "Framework only",
    href: "/research/rl-market-robustness",
  },
];

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Projects"
        title="What has been built"
        description="Each component with its research question, methods, technologies, current status and actual results. The one project with no results says so."
        meta={
          <>
            <Badge tone="positive">{PROJECTS.filter((p) => p.status === "Built and tested").length} built and tested</Badge>
            <Badge tone="caution">{PROJECTS.filter((p) => p.status === "Framework only").length} framework only</Badge>
          </>
        }
      />

      <Section>
        <Callout tone="accent" title="On the results column">
          <p>
            Every figure quoted below was produced by the code in this repository at a stated seed, and can be
            regenerated from the corresponding lab. The RL study&rsquo;s results field reads &ldquo;none&rdquo;
            because no experiment has been run — that is the honest entry, not a placeholder awaiting better
            news.
          </p>
        </Callout>

        <div className="mt-6 space-y-3">
          {PROJECTS.map((project) => (
            <Card key={project.name}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold tracking-tight text-ink">{project.name}</h2>
                  <Badge tone={STATUS_TONE[project.status]}>{project.status}</Badge>
                </div>

                <p className="mt-2 max-w-prose text-xs font-medium italic leading-relaxed text-accent">
                  {project.question}
                </p>
                <p className="mt-2 max-w-prose text-xs leading-relaxed text-ink-muted">{project.description}</p>

                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">Methods</dt>
                    <dd className="mt-1 flex flex-wrap gap-1">
                      {project.methods.map((m) => (
                        <span key={m} className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-2xs text-ink-muted">
                          {m}
                        </span>
                      ))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">Technologies</dt>
                    <dd className="mt-1 flex flex-wrap gap-1">
                      {project.technologies.map((t) => (
                        <span key={t} className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-2xs text-ink-muted">
                          {t}
                        </span>
                      ))}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3 rounded-card border border-line bg-surface-sunken px-3 py-2.5">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">Results</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">{project.results}</p>
                </div>

                {project.href ? (
                  <Link href={project.href} className="mt-3 inline-block text-xs font-medium text-accent hover:underline">
                    Open →
                  </Link>
                ) : null}
              </CardBody>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}
