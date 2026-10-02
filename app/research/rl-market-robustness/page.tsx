import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody, CardHeader, Badge, Callout, DataTable } from "@/components/ui";
import { EquationBlock, InlineMath } from "@/components/math/Equation";

export const metadata = {
  title: "RL Market Robustness",
  description:
    "An experimental framework for studying which reward designs produce reinforcement learning trading agents that remain robust when market conditions shift away from their training distribution.",
};

function Pending({ children }: { children: string }) {
  return (
    <div className="rounded-card border border-dashed border-caution/50 bg-caution/5 px-4 py-5 text-center">
      <Badge tone="caution">Research in progress</Badge>
      <p className="mx-auto mt-2 max-w-prose text-xs leading-relaxed text-ink-muted">{children}</p>
    </div>
  );
}

function SectionBlock({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="scroll-mt-20" id={title.toLowerCase().replace(/[^a-z]+/g, "-")}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="tabular text-2xs font-semibold text-ink-faint">{number}</span>
        <h2 className="text-xs font-semibold uppercase tracking-[0.13em] text-ink-muted">{title}</h2>
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
      </div>
      {children}
    </section>
  );
}

export default function RLResearchPage() {
  return (
    <>
      <PageHeader
        eyebrow="Research framework"
        title="Robustness of Reinforcement Learning Trading Agents Under Distribution Shift"
        description="An experimental design, published before the experiments are run. The results sections below are empty on purpose and will stay empty until the work is done."
        meta={
          <>
            <Badge tone="caution">Research in progress</Badge>
            <Badge tone="neutral">No results yet</Badge>
            <Badge tone="neutral">Synthetic environments only</Badge>
          </>
        }
      />

      <div className="mx-auto max-w-content space-y-9 px-4 py-9 sm:px-6">
        <Callout tone="caution" title="Status: design only">
          <p>
            Nothing on this page reports an experimental outcome. The research question, hypotheses,
            environment, agent specification, reward functions, shift conditions and evaluation metrics are
            defined. No agent has been trained and no result has been measured.
          </p>
          <p>
            Publishing the design first is a form of pre-registration. It means the analysis plan cannot be
            quietly adjusted after the results arrive — which is the mechanism by which a great deal of
            published research becomes unreliable.
          </p>
        </Callout>

        <SectionBlock number="01" title="Research question">
          <Card>
            <CardBody className="space-y-3">
              <p className="max-w-prose text-sm leading-relaxed text-ink">
                Which reward function design produces reinforcement learning trading agents whose performance
                degrades least when they are evaluated in market environments that differ from the one they
                were trained in?
              </p>
              <p className="max-w-prose text-xs leading-relaxed text-ink-muted">
                The question is deliberately about <em>robustness</em> rather than peak performance. An agent
                that performs brilliantly in its training environment and collapses outside it has learned the
                environment, not the task. Since real markets are non-stationary, the degradation under shift
                is the quantity that matters.
              </p>
            </CardBody>
          </Card>
        </SectionBlock>

        <SectionBlock number="02" title="Motivation">
          <Card>
            <CardBody className="space-y-2.5 text-xs leading-relaxed text-ink-muted">
              <p>
                Reinforcement learning is a natural fit for trading: the problem is sequential, the state is
                partially observable, actions affect future states, and there are no labelled correct answers
                to learn from. These are precisely the conditions RL was designed for.
              </p>
              <p>
                It is also unusually easy to fool yourself with. An RL agent is an extremely flexible function
                approximator optimising against a single scalar objective, trained on a limited sample of a
                non-stationary process. Every ingredient of catastrophic overfitting is present, and the
                standard validation methods — which assume the test distribution matches the training
                distribution — cannot detect the failure mode that matters most.
              </p>
              <p>
                The reward function is the part of an RL system most directly under the designer&rsquo;s
                control, and the part most likely to determine what the agent actually learns. A raw-return
                reward and a drawdown-aware reward can produce completely different policies from identical
                data. Whether that choice also affects <em>robustness</em> is, as far as this project is
                concerned, an open question — which is why it is worth measuring rather than assuming.
              </p>
            </CardBody>
          </Card>
        </SectionBlock>

        <SectionBlock number="03" title="Hypotheses">
          <Card>
            <CardBody>
              <DataTable
                columns={["", "Hypothesis", "Rationale", "What would falsify it"]}
                align={["left", "left", "left", "left"]}
                rows={[
                  [
                    <strong key="h1" className="text-ink">H1</strong>,
                    "Risk-adjusted and drawdown-aware rewards produce smaller generalisation gaps than raw-return rewards.",
                    "A raw-return objective is maximised by taking maximum exposure, which is optimal only if the training distribution's favourable drift persists. Risk-sensitive objectives should depend less on that specific feature.",
                    "Observing no significant difference in generalisation gap across reward functions, or raw return generalising best.",
                  ],
                  [
                    <strong key="h2" className="text-ink">H2</strong>,
                    "The ranking of reward functions by training performance differs from their ranking by worst-case shifted performance.",
                    "If training and robustness rankings coincided, selecting on training performance would be sufficient and the research question would be uninteresting.",
                    "Observing the same ordering under both criteria across seeds.",
                  ],
                  [
                    <strong key="h3" className="text-ink">H3</strong>,
                    "Agents trained with higher transaction costs are more robust to shifts in transaction costs, and no less robust to other shifts.",
                    "Higher training costs penalise high-turnover policies, which may be the policies most sensitive to environment details.",
                    "Observing that cost-trained agents are more fragile to volatility or regime shifts.",
                  ],
                  [
                    <strong key="h0" className="text-ink">H0</strong>,
                    "No reward function outperforms the Oracle baseline, and none reliably outperforms buy-and-hold after costs.",
                    "This is the null hypothesis and the most likely outcome. It must be stated in advance so that confirming it counts as a result rather than a failure.",
                    "An agent reliably beating buy-and-hold net of costs across multiple seeds and shift conditions.",
                  ],
                ]}
                caption="Hypotheses are recorded before any experiment is run, including the null. Stating what would falsify each one is what makes it a hypothesis rather than an expectation."
              />
            </CardBody>
          </Card>
        </SectionBlock>

        <SectionBlock number="04" title="Experimental design">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Market simulator" subtitle="The environment is synthetic, which is the point." />
              <CardBody className="space-y-2.5 text-xs leading-relaxed text-ink-muted">
                <p>
                  A three-state Markov-switching market, identical to the one in the{" "}
                  <Link href="/labs/market-regimes" className="text-accent hover:underline">
                    Market Regime Simulator
                  </Link>
                  . Bull, bear and sideways regimes each have their own drift and volatility, and transition
                  according to a matrix specified in advance.
                </p>
                <p>
                  Synthetic data is not a compromise here — it is what makes the experiment possible. Because
                  the data-generating process is known, the distribution shift can be constructed exactly, and
                  the Oracle baseline can be computed to establish whether exploitable structure exists at all.
                  Neither is possible with historical data.
                </p>
                <p className="text-ink-faint">
                  Reproducibility: every environment is specified by a seed and a parameter set, exported
                  alongside any result.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Agent specification" />
              <CardBody className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-ink">State</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    The last five returns, a rolling volatility estimate, the current position, and a rolling
                    return estimate. Deliberately small and fully observable, so that any failure can be
                    attributed to the learning problem rather than to representation capacity.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink">Action space</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    Binary: <InlineMath>{"a \\in \\{0, 1\\}"}</InlineMath>, where 0 is cash and 1 is fully
                    invested. No leverage and no shorting, which keeps the action space minimal and avoids the
                    degenerate solution of maximising leverage under a raw-return reward.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink">Transition</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    The agent observes the state at the close of day t−1 and chooses the position held through
                    day t. This is the same one-step lag enforced throughout the{" "}
                    <Link href="/labs/backtesting" className="text-accent hover:underline">Backtesting Lab</Link>,
                    and it is what prevents look-ahead bias.
                  </p>
                </div>
              </CardBody>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader title="Reward functions" subtitle="The independent variable. Everything else is held constant across the three conditions." />
            <CardBody className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-card border border-line bg-surface-sunken px-3 py-3">
                  <p className="text-xs font-semibold text-ink">R1 — Raw return</p>
                  <EquationBlock equation={"R_t = a_{t-1} r_t - c\\left|a_{t-1} - a_{t-2}\\right|"} />
                  <p className="mt-1 text-2xs leading-relaxed text-ink-muted">
                    The simplest objective. Maximised by holding the market whenever expected return is
                    positive, with no penalty for the variance of the path.
                  </p>
                </div>
                <div className="rounded-card border border-line bg-surface-sunken px-3 py-3">
                  <p className="text-xs font-semibold text-ink">R2 — Risk-adjusted</p>
                  <EquationBlock equation={"R_t = \\frac{a_{t-1}r_t - c\\,\\Delta}{\\hat{\\sigma}_t + \\epsilon}"} />
                  <p className="mt-1 text-2xs leading-relaxed text-ink-muted">
                    Return scaled by a rolling volatility estimate. ε prevents division by zero. Encourages
                    taking exposure when volatility is low relative to the return earned.
                  </p>
                </div>
                <div className="rounded-card border border-line bg-surface-sunken px-3 py-3">
                  <p className="text-xs font-semibold text-ink">R3 — Drawdown-aware</p>
                  <EquationBlock equation={"R_t = a_{t-1}r_t - c\\,\\Delta - \\lambda \\max(0, D_t)"} />
                  <p className="mt-1 text-2xs leading-relaxed text-ink-muted">
                    Return with an explicit penalty on the current drawdown from the running high-water mark.
                    λ controls the severity and is itself a parameter to be fixed in advance.
                  </p>
                </div>
              </div>
              <Callout tone="caution" title="A design risk worth stating now">
                <p>
                  R2 and R3 both introduce path-dependent terms into the reward, which technically breaks the
                  Markov property of the state unless the relevant statistic is included in the state itself.
                  The state specification therefore includes rolling volatility (for R2) and must include the
                  drawdown level (for R3). If it does not, the agent faces a partially observable problem and
                  any comparison with R1 is confounded.
                </p>
                <p>
                  Recording this before running anything is the point of writing the design down.
                </p>
              </Callout>
            </CardBody>
          </Card>
        </SectionBlock>

        <SectionBlock number="05" title="Distribution shifts">
          <Card>
            <CardBody>
              <DataTable
                columns={["Shift", "Training value", "Evaluation values", "What it tests"]}
                align={["left", "left", "left", "left"]}
                rows={[
                  ["Higher volatility", "Baseline regime volatilities", "1.5× and 2.5× all regime volatilities", "Whether the policy depends on the specific volatility scale it saw."],
                  ["Altered regime persistence", "Baseline transition matrix", "Diagonal reduced by 0.03 and by 0.10", "Whether the policy depends on regimes lasting as long as they did in training."],
                  ["Different trend strength", "Baseline drifts", "Bull drift halved; bear drift doubled", "Whether the policy learned a general rule or memorised a favourable drift."],
                  ["Higher transaction costs", "Training cost c", "2× and 5× the training cost", "Whether the policy's turnover is sustainable at realistic costs."],
                  ["Combined", "—", "Volatility and persistence shifted together", "Whether failures compound, which single-factor tests cannot reveal."],
                ]}
                caption="Each shift is applied to the evaluation environment only. The agent is never retrained on shifted data — that is what makes it a test of generalisation rather than adaptation."
              />
            </CardBody>
          </Card>
        </SectionBlock>

        <SectionBlock number="06" title="Evaluation metrics">
          <Card>
            <CardBody className="space-y-3">
              <EquationBlock
                label="Generalisation gap"
                equation={"G = \\text{Performance}_{\\text{train}} - \\text{Performance}_{\\text{shifted}}"}
                description="The primary outcome measure. Smaller is more robust, and a negative gap would mean the agent performs better outside its training environment — which would itself demand explanation."
              />
              <DataTable
                columns={["Metric", "Definition", "Why it is included"]}
                align={["left", "left", "left"]}
                rows={[
                  ["Train performance", "Sharpe ratio on the training distribution", "Establishes that learning occurred at all."],
                  ["Mean shifted performance", "Average Sharpe across all shift conditions", "Average-case robustness."],
                  ["Worst-case shifted performance", "Minimum Sharpe across shift conditions", "Worst-case robustness, which is what determines survival."],
                  ["Generalisation gap", "Train minus mean shifted", "The primary outcome."],
                  ["Turnover", "Total absolute position change", "Diagnoses whether robustness differences are really cost differences."],
                  ["Oracle gap", "Oracle Sharpe minus agent Sharpe", "How much of the available structure the agent captured."],
                  ["Buy-and-hold gap", "Agent Sharpe minus buy-and-hold Sharpe", "Whether the agent beat doing nothing, which is the bar that matters."],
                ]}
                caption="All metrics computed net of transaction costs, across multiple random seeds, with dispersion reported alongside central tendency."
              />
              <Callout tone="accent" title="Seeds and multiple comparisons">
                <p>
                  The design is three reward functions × three cost conditions × five shift conditions, which
                  is 45 cells. Reporting the best cell would be exactly the error the{" "}
                  <Link href="/labs/overfitting" className="text-accent hover:underline">Overfitting Lab</Link>{" "}
                  demonstrates. Each cell will therefore be run across multiple seeds, and the analysis will
                  report distributions across seeds rather than point estimates — with the number of seeds
                  fixed before the first run.
                </p>
              </Callout>
            </CardBody>
          </Card>
        </SectionBlock>

        <SectionBlock number="07" title="Baselines">
          <Card>
            <CardBody className="space-y-3">
              <p className="max-w-prose text-xs leading-relaxed text-ink-muted">
                An RL result is meaningless without baselines. Five are specified, all already implemented and
                tested in the{" "}
                <Link href="/labs/backtesting" className="text-accent hover:underline">Backtesting Lab</Link>:
              </p>
              <DataTable
                columns={["Baseline", "Role"]}
                align={["left", "left"]}
                rows={[
                  ["Buy and hold", "The bar that matters. It has essentially zero turnover, so costs cannot hurt it."],
                  ["Always cash", "The floor. Zero return at zero risk is always available."],
                  ["Momentum", "A simple rule with a real mechanism. If the agent cannot beat it, the agent learned nothing a rule could not."],
                  ["Mean reversion", "The opposite simple rule, included so the comparison is not cherry-picked."],
                  ["Random policy", "The null hypothesis. Also establishes the distribution of outcomes achievable by luck."],
                  ["Oracle", "Knows the hidden regime. Not a strategy — it measures whether the environment contains exploitable structure at all."],
                ]}
              />
              <Callout tone="accent" title="The Oracle result already found in the Backtesting Lab">
                <p>
                  Building the baselines produced one finding worth recording in advance, because it reframes
                  the question. On the default regime market at 0.1% transaction costs, the Oracle — which
                  knows the hidden state exactly — achieves a higher gross Sharpe than buy-and-hold but a{" "}
                  <em>lower net</em> Sharpe, because acting on its perfect information costs more than the
                  information is worth.
                </p>
                <p>
                  If that holds across seeds, then no agent in this environment can beat buy-and-hold by regime
                  timing at that cost level, regardless of how well it learns. The experiment would then be
                  measuring robustness among policies that all lose to doing nothing — which is still a valid
                  question, but a different one, and it must be stated as such rather than discovered later.
                </p>
              </Callout>
            </CardBody>
          </Card>
        </SectionBlock>

        <SectionBlock number="08" title="Results">
          <Pending>
            No experiments have been run. This section will contain the measured generalisation gaps, per-seed
            distributions and baseline comparisons once the agents have been trained and evaluated. It will not
            contain anything before then.
          </Pending>
        </SectionBlock>

        <SectionBlock number="09" title="Interpretation">
          <Pending>
            Interpretation cannot be written before results exist. Writing it in advance would amount to
            deciding the conclusion first, which is the failure mode this entire page is structured to prevent.
          </Pending>
        </SectionBlock>

        <SectionBlock number="10" title="Limitations">
          <Card>
            <CardBody>
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {[
                  { title: "Synthetic environments only", body: "Every environment is generated by a model that is itself a simplification. Robustness to synthetic shifts is not the same as robustness to real market change, and results here would not transfer without further work." },
                  { title: "A small, fully observable state", body: "The state is deliberately minimal. A richer state might learn more; it would also overfit more. This design cannot distinguish those effects." },
                  { title: "Binary actions", body: "No leverage, no shorting, no position sizing. This removes some degenerate solutions but also removes most of the decision problem a real agent faces." },
                  { title: "Limited seeds", body: "Compute is limited. The number of seeds determines how much of the observed variation can be distinguished from noise, and it will be reported alongside every result." },
                  { title: "One environment family", body: "All shifts are within the Markov-switching family. A shift to a genuinely different process — jumps, say — is not tested." },
                  { title: "No market impact", body: "The agent's trades do not move the market. In any realistic setting a profitable strategy's own activity erodes its edge." },
                ].map((item) => (
                  <div key={item.title} className="border-l-2 border-line pl-3">
                    <p className="text-xs font-semibold text-ink">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">{item.body}</p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </SectionBlock>

        <SectionBlock number="11" title="Future work">
          <Card>
            <CardBody>
              <ul className="space-y-2 text-xs leading-relaxed text-ink-muted">
                {[
                  "Implement the environment as a reusable interface so the same agents can be evaluated against jump-diffusion and AR(1) markets without rewriting the agent.",
                  "Add a position-sizing action space once the binary case is understood, and check whether the reward-function ranking survives.",
                  "Compare against a hidden Markov model fitted by Baum-Welch, which would establish how much of the Oracle gap is attributable to state estimation rather than to policy learning.",
                  "Investigate whether training across a MIXTURE of environments improves robustness more than any reward design does — a plausible alternative explanation that this design cannot rule out.",
                  "Quantify how many seeds are needed to distinguish the reward functions, before committing compute to the full grid.",
                ].map((text, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="tabular shrink-0 text-accent">{String(i + 1).padStart(2, "0")}</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </SectionBlock>

        <SectionBlock number="12" title="Code">
          <Card>
            <CardBody className="space-y-2.5 text-xs leading-relaxed text-ink-muted">
              <p>
                The simulation infrastructure this study depends on is already built and tested in this
                repository: the regime-switching market generator, the strategy framework with its one-step
                lag, the transaction-cost model, the Oracle baseline, and the performance and risk metrics.
                Every one of those is covered by the numerical test suite.
              </p>
              <p>
                The agent implementation and training loop are not yet written. When they are, they will be
                added here with the seeds and configurations needed to reproduce every reported number.
              </p>
            </CardBody>
          </Card>
        </SectionBlock>
      </div>
    </>
  );
}
