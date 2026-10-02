"use client";

import { useState } from "react";
import { CHALLENGES, CATEGORIES, DIFFICULTY_TONE, type ChallengeCategory, type Difficulty } from "@/content/challenges";
import { Card, CardBody, Badge, Button } from "@/components/ui";

const DIFFICULTIES: Difficulty[] = ["Beginner", "Intermediate", "Advanced"];

export function ChallengeList() {
  const [category, setCategory] = useState<ChallengeCategory | "All">("All");
  const [difficulty, setDifficulty] = useState<Difficulty | "All">("All");
  // Each challenge independently tracks how much the reader has revealed.
  const [revealed, setRevealed] = useState<Record<string, "none" | "hints" | "solution">>({});

  const visible = CHALLENGES.filter(
    (c) => (category === "All" || c.category === category) && (difficulty === "All" || c.difficulty === difficulty),
  );

  const setReveal = (id: string, level: "none" | "hints" | "solution") =>
    setRevealed((previous) => ({ ...previous, [id]: level }));

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-4">
        <fieldset>
          <legend className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">Category</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Button size="sm" variant={category === "All" ? "primary" : "secondary"} onClick={() => setCategory("All")}>
              All
            </Button>
            {CATEGORIES.map((c) => (
              <Button key={c} size="sm" variant={category === c ? "primary" : "secondary"} onClick={() => setCategory(c)}>
                {c}
              </Button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">Difficulty</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Button size="sm" variant={difficulty === "All" ? "primary" : "secondary"} onClick={() => setDifficulty("All")}>
              All
            </Button>
            {DIFFICULTIES.map((d) => (
              <Button key={d} size="sm" variant={difficulty === d ? "primary" : "secondary"} onClick={() => setDifficulty(d)}>
                {d}
              </Button>
            ))}
          </div>
        </fieldset>
      </div>

      <p role="status" aria-live="polite" className="mb-3 text-2xs text-ink-faint">
        Showing {visible.length} of {CHALLENGES.length} challenges.
      </p>

      <div className="space-y-3">
        {visible.map((challenge) => {
          const level = revealed[challenge.id] ?? "none";
          return (
            <Card key={challenge.id}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="tabular text-2xs font-semibold text-accent">{challenge.id}</span>
                    <Badge tone="neutral">{challenge.category}</Badge>
                    <Badge tone={DIFFICULTY_TONE[challenge.difficulty]}>{challenge.difficulty}</Badge>
                  </div>
                </div>

                <h2 className="mt-2 text-sm font-semibold tracking-tight text-ink">{challenge.title}</h2>
                <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-ink-muted">{challenge.problem}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {level === "none" ? (
                    <>
                      <Button size="sm" onClick={() => setReveal(challenge.id, "hints")}>
                        Show hints
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setReveal(challenge.id, "solution")}>
                        Skip to solution
                      </Button>
                    </>
                  ) : null}
                  {level === "hints" ? (
                    <>
                      <Button size="sm" onClick={() => setReveal(challenge.id, "solution")}>
                        Show solution
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setReveal(challenge.id, "none")}>
                        Hide hints
                      </Button>
                    </>
                  ) : null}
                  {level === "solution" ? (
                    <Button size="sm" variant="ghost" onClick={() => setReveal(challenge.id, "none")}>
                      Hide everything
                    </Button>
                  ) : null}
                </div>

                {level === "hints" || level === "solution" ? (
                  <div className="animate-fade-in mt-3 rounded-card border border-line bg-surface-sunken px-3 py-2.5">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">Hints</p>
                    <ol className="mt-1.5 space-y-1">
                      {challenge.hints.map((hint, i) => (
                        <li key={i} className="flex gap-2 text-xs leading-relaxed text-ink-muted">
                          <span className="tabular shrink-0 text-ink-faint">{i + 1}.</span>
                          <span>{hint}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}

                {level === "solution" ? (
                  <div className="animate-fade-in mt-3 space-y-3">
                    <div className="rounded-card border border-line bg-surface-sunken px-3 py-2.5">
                      <p className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">Working</p>
                      <ol className="mt-1.5 space-y-1 border-l-2 border-line pl-3">
                        {challenge.solution.map((step, i) => (
                          <li key={i} className="tabular text-xs leading-relaxed text-ink-muted">
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="rounded-card border border-accent-muted bg-accent-muted/10 px-3 py-2.5">
                      <p className="text-2xs font-semibold uppercase tracking-wider text-accent">Answer</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink">{challenge.answer}</p>
                    </div>
                    {challenge.simulation ? (
                      <div className="rounded-card border border-line px-3 py-2.5">
                        <p className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                          Check it by simulation
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{challenge.simulation}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
