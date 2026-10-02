import Link from "next/link";

const COLUMNS = [
  {
    heading: "Labs",
    links: [
      { href: "/labs/monte-carlo", label: "Monte Carlo" },
      { href: "/labs/market-regimes", label: "Market regimes" },
      { href: "/labs/portfolio-optimizer", label: "Portfolio optimizer" },
      { href: "/labs/risk-analyzer", label: "Risk analyzer" },
      { href: "/labs/backtesting", label: "Backtesting" },
      { href: "/labs/overfitting", label: "Overfitting" },
    ],
  },
  {
    heading: "Learn",
    links: [
      { href: "/learn", label: "Lesson index" },
      { href: "/learn/expected-value", label: "Expected value" },
      { href: "/learn/monte-carlo-simulation", label: "Monte Carlo" },
      { href: "/glossary", label: "Glossary" },
      { href: "/challenges", label: "Challenges" },
    ],
  },
  {
    heading: "Research",
    links: [
      { href: "/research", label: "Research index" },
      { href: "/research/rl-market-robustness", label: "RL robustness" },
      { href: "/research/experiment-log", label: "Experiment log" },
      { href: "/research/journal", label: "Journal" },
      { href: "/references", label: "References" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm font-semibold text-ink">
              Quant<span className="text-accent">Lab</span>
            </p>
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-ink-muted">
              An interactive laboratory for the mathematics behind markets. Every number on this site is
              computed in your browser from the parameters you set.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">{column.heading}</p>
              <ul className="mt-2.5 space-y-1.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-xs text-ink-muted transition-colors hover:text-accent">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-9 border-t border-line pt-5">
          <p className="max-w-3xl text-2xs leading-relaxed text-ink-faint">
            <strong className="font-semibold text-ink-muted">Educational disclaimer.</strong> QuantLab is an
            educational and research platform. The simulations and models shown here are simplified
            representations of financial markets and should not be interpreted as investment advice. Nothing on
            this site predicts market prices. All market data is synthetic unless explicitly stated otherwise.
          </p>
        </div>
      </div>
    </footer>
  );
}
