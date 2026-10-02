import { PageHeader, Section } from "@/components/PageHeader";
import { Callout } from "@/components/ui";
import { ChallengeList } from "./ChallengeList";
import { CHALLENGES } from "@/content/challenges";

export const metadata = {
  title: "Challenges",
  description:
    "Original quantitative-thinking problems across probability, statistics, algorithms, market modelling, logic and optimisation, each with hints, a full solution and a way to check the answer by simulation.",
};

export default function ChallengesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Challenges"
        title="Quantitative thinking problems"
        description={`${CHALLENGES.length} problems with hints, complete worked solutions, and a simulation you can run to check each answer. Several of them have answers that contradict most people's first instinct, which is why they are worth doing rather than reading.`}
      />

      <Section>
        <Callout tone="accent" title="How to use these">
          <p>
            Try each problem before revealing anything. If you get stuck, take one hint at a time rather than
            all three. The working is shown in full because the method matters more than the number.
          </p>
          <p>
            Where a problem can be checked by simulation, the final box says how. Verifying an analytic answer
            numerically is a genuinely useful habit — it catches algebra errors, and it builds the instinct that
            a result you cannot check is a result you do not yet own.
          </p>
        </Callout>

        <div className="mt-6">
          <ChallengeList />
        </div>
      </Section>
    </>
  );
}
