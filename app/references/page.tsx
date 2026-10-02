import { PageHeader, Section } from "@/components/PageHeader";
import { Card, CardBody, Badge, Callout } from "@/components/ui";

export const metadata = {
  title: "References",
  description: "Sources used while building QuantLab, with verification status marked explicitly.",
};

interface Reference {
  citation: string;
  topic: string;
  usedFor: string;
  verified: boolean;
  note?: string;
}

/**
 * Only widely-known, checkable works are listed, and each is marked with whether
 * the exact edition and page-level content were verified during this build.
 * Anything that could not be checked is labelled rather than presented as
 * confirmed — inventing a plausible-looking citation is worse than admitting
 * uncertainty.
 */
const REFERENCES: Reference[] = [
  {
    citation: "Black, F. and Scholes, M. (1973). 'The Pricing of Options and Corporate Liabilities.' Journal of Political Economy, 81(3), 637–654.",
    topic: "Option pricing",
    usedFor: "The Black-Scholes formula and the replication argument behind risk-neutral pricing.",
    verified: true,
    note: "Foundational and universally cited; the formula as implemented matches the standard statement.",
  },
  {
    citation: "Merton, R. C. (1973). 'Theory of Rational Option Pricing.' Bell Journal of Economics and Management Science, 4(1), 141–183.",
    topic: "Option pricing",
    usedFor: "The dividend-yield extension used in the Options Lab.",
    verified: true,
  },
  {
    citation: "Markowitz, H. (1952). 'Portfolio Selection.' Journal of Finance, 7(1), 77–91.",
    topic: "Portfolio theory",
    usedFor: "Mean-variance optimisation and the efficient frontier.",
    verified: true,
  },
  {
    citation: "Sharpe, W. F. (1966). 'Mutual Fund Performance.' Journal of Business, 39(1), 119–138.",
    topic: "Performance measurement",
    usedFor: "The reward-to-variability ratio now known as the Sharpe ratio.",
    verified: true,
  },
  {
    citation: "Artzner, P., Delbaen, F., Eber, J.-M. and Heath, D. (1999). 'Coherent Measures of Risk.' Mathematical Finance, 9(3), 203–228.",
    topic: "Risk measurement",
    usedFor: "The coherence axioms, and specifically why VaR fails subadditivity while expected shortfall does not.",
    verified: true,
  },
  {
    citation: "Hamilton, J. D. (1989). 'A New Approach to the Economic Analysis of Nonstationary Time Series and the Business Cycle.' Econometrica, 57(2), 357–384.",
    topic: "Regime switching",
    usedFor: "Markov-switching models of time series with changing regimes.",
    verified: true,
  },
  {
    citation: "Acklam, P. J. 'An algorithm for computing the inverse normal cumulative distribution function.'",
    topic: "Numerical methods",
    usedFor: "The inverse normal CDF used for parametric VaR quantiles.",
    verified: false,
    note: "Widely circulated and reproduced in many numerical libraries; the coefficients used here were checked against the function's own stated accuracy (relative error below 1.15e-9) by round-trip testing, but the original publication venue was not verified during this build.",
  },
  {
    citation: "Hart, J. F. et al. (1968). Computer Approximations. Wiley.",
    topic: "Numerical methods",
    usedFor: "The rational approximation to the normal CDF, in the arrangement commonly attributed to Graeme West's note on cumulative normal functions.",
    verified: false,
    note: "The algorithm's accuracy was verified empirically here — it returns exactly 0.5 at zero and matches published standard-normal values to 10 decimal places — but the original text was not consulted directly.",
  },
  {
    citation: "Steinarsson, S. (2013). 'Downsampling Time Series for Visual Representation.' MSc thesis, University of Iceland.",
    topic: "Visualisation",
    usedFor: "The Largest-Triangle-Three-Buckets downsampling algorithm used in the charts.",
    verified: false,
    note: "The algorithm is widely implemented and its behaviour was verified by test (it preserves isolated extremes that naive decimation drops). The thesis itself was not consulted.",
  },
  {
    citation: "Bailey, D. H., Borwein, J., López de Prado, M. and Zhu, Q. J. (2014). 'Pseudo-Mathematics and Financial Charlatanism: The Effects of Backtest Overfitting on Out-of-Sample Performance.' Notices of the AMS, 61(5), 458–471.",
    topic: "Overfitting",
    usedFor: "The framing of backtest overfitting as a multiple-testing problem.",
    verified: true,
    note: "The specific result reproduced in the Overfitting Lab — that in-sample ranking carries no out-of-sample information when no signal exists — was derived and measured independently here, not taken from this paper.",
  },
];

export default function ReferencesPage() {
  const verified = REFERENCES.filter((r) => r.verified).length;

  return (
    <>
      <PageHeader
        eyebrow="Reference"
        title="References"
        description="Sources consulted while building QuantLab. Each is marked with whether it was verified during this build — anything that could not be confirmed says so rather than being presented as certain."
        meta={
          <>
            <Badge tone="positive">{verified} verified</Badge>
            <Badge tone="caution">{REFERENCES.length - verified} needs verification</Badge>
          </>
        }
      />

      <Section>
        <Callout tone="caution" title="On citation honesty">
          <p>
            Fabricating a plausible-looking citation is worse than having none, because it is harder to detect
            and it corrupts anyone who follows it. The entries below marked{" "}
            <strong className="text-ink">needs verification</strong> are works whose algorithms are widely
            implemented and whose behaviour was checked empirically in this codebase, but whose original
            publications were not consulted directly during this build.
          </p>
          <p>
            Where that is the case, the note says exactly what <em>was</em> verified — usually numerical
            behaviour against known values — so the distinction between &ldquo;this algorithm works&rdquo; and
            &ldquo;this citation is confirmed&rdquo; stays visible.
          </p>
        </Callout>

        <div className="mt-6 space-y-3">
          {REFERENCES.map((reference) => (
            <Card key={reference.citation}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Badge tone="neutral">{reference.topic}</Badge>
                  <Badge tone={reference.verified ? "positive" : "caution"}>
                    {reference.verified ? "Verified" : "Needs verification"}
                  </Badge>
                </div>
                <p className="mt-2 max-w-prose text-xs leading-relaxed text-ink">{reference.citation}</p>
                <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-ink-muted">
                  <strong className="font-medium">Used for: </strong>
                  {reference.usedFor}
                </p>
                {reference.note ? (
                  <p className="mt-1.5 max-w-prose border-l-2 border-line pl-2.5 text-2xs leading-relaxed text-ink-faint">
                    {reference.note}
                  </p>
                ) : null}
              </CardBody>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}
