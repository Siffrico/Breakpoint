import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { UnitMasteryContract } from "@acme/validators";

import type { UnitTurnDependencies } from "./run-unit-turn";
import type { PersistedUnitRun } from "./unit-state";
import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";
import { runPassAdvanceTurn, runUnitTurn } from "./run-unit-turn";
import { attachChallenge, createUnitRun } from "./unit-state";

const masteryContract = {
  version: 1,
  dimensions: [
    {
      id: "derive-under-pressure",
      name: "Derive under pressure",
      description:
        "Re-derive the decision when a realistic constraint changes.",
      passSignals: ["Explains why the changed constraint changes the move"],
      failSignals: ["Repeats the original procedure"],
      surrogateTraps: ["Uses the right vocabulary without a causal chain"],
    },
  ],
} satisfies UnitMasteryContract;

const challengeContract = {
  version: 1 as const,
  runKind: "education" as const,
  scenarioPromptSummary: "Choose under a changed production constraint.",
  testedDimensions: [
    {
      dimensionId: "derive-under-pressure",
      promptRole: "Test mechanism-based transfer.",
      expectedStrongMoves: ["Re-derives from the changed constraint"],
      acceptableVariants: [],
      commonWrongMoves: ["Copies the original procedure"],
      scoreBands: {
        strong: "Correct and causal.",
        partial: "Plausible with a gap.",
        weak: "Copied or unsupported.",
      },
    },
  ],
  learnerVisibleCriteria: ["Choose one move and defend it."],
  evaluatorNotes: ["Do not reward copied wording."],
};

const difficultyVector = {
  formatId: "frq",
  reasoningPathSteps: 3,
  withheldGivens: 1,
  embeddedAlternatives: 2,
};

const baseRun = (): PersistedUnitRun => ({
  ...createUnitRun({
    unitId: "unit-1",
    sessionId: "session-1",
    userId: "user-1",
    kind: "education",
    masteryContract,
    experience: DEFAULT_EDUCATION_EXPERIENCE,
  }),
  difficultySnapshot: {
    nodeId: "node-1",
    directive: {
      intent: "probe" as const,
      bandOrder: 0,
      supportLevel: "none" as const,
      targetItemRating: 1200,
      targetMisconceptionCode: null,
      reason: "Probe independent transfer.",
      nextProgress: { bandOrder: 0, supportLevel: "none" as const },
    },
    promptBlock: "Probe independent transfer.",
    ratingSnapshot: "rating snapshot",
    learnerRating: 1200,
    format: {
      id: "frq",
      label: "Free response",
      kind: "frq" as const,
      description: "Explain the decision.",
    },
    dialPreset: {
      steps: [3, 3],
      withheldGivens: [1, 1],
      alternatives: [2, 2],
    },
  },
});

const input = (run = baseRun()) => ({
  run,
  transcript: [{ role: "user" as const, content: "I would derive it again." }],
  experience: DEFAULT_EDUCATION_EXPERIENCE,
  buildContext: {
    forMentor: () => "Unit context with the capability checklist.",
    forPresenter: () => "Unit context for authoring the challenge.",
    forCritic: () => "Unit context with the mastery contract.",
  },
});

const deps = (
  overrides: Partial<UnitTurnDependencies> = {},
): UnitTurnDependencies => ({
  runMentor: () =>
    Effect.succeed({
      object: {
        assistantMessage: "Try the same decision after the constraint changes.",
        completedCapabilityId: null,
      },
    }),
  runReviewPresentation: () =>
    Effect.succeed({
      object: {
        assistantMessage:
          "The production constraint changed. Choose the next move and defend it.",
      },
    }),
  runReviewGrade: () =>
    Effect.succeed({
      object: {
        assistantMessage:
          "Your defense still copies the original rule. Try this changed case and re-derive the move.",
        errorCodes: [],
        gradeReasoning:
          "The learner repeated the procedure without deriving it.",
        dimensionResults: [
          {
            dimensionId: "derive-under-pressure",
            score: 62,
            evidence: "I would derive it again.",
            missing: "A causal derivation from the changed constraint.",
          },
        ],
      },
    }),
  ...overrides,
});

describe("runUnitTurn", () => {
  it("keeps the mentor on an incomplete capability", async () => {
    const result = await Effect.runPromise(runUnitTurn(input(), deps()));

    expect(result.actor).toBe("mentor");
    expect(result.nextRun.mode).toBe("learning");
    expect(result.nextRun.todos[0]?.status).toBe("pending");
  });

  it("completes a mentor todo with only its id", async () => {
    const result = await Effect.runPromise(
      runUnitTurn(
        input(),
        deps({
          runMentor: () =>
            Effect.succeed({
              object: {
                assistantMessage: "Move on.",
                completedCapabilityId: "derive-under-pressure",
              },
            }),
        }),
      ),
    );

    expect(result.nextRun.todos[0]).toMatchObject({
      status: "completed",
    });
  });

  it("hands the final mentor completion directly to adversarial review", async () => {
    const mentorMessage =
      "You re-derived the move correctly from the changed constraint.";
    const result = await Effect.runPromise(
      runUnitTurn(
        input(),
        deps({
          runMentor: () =>
            Effect.succeed({
              object: {
                assistantMessage: mentorMessage,
                completedCapabilityId: "derive-under-pressure",
              },
            }),
        }),
      ),
    );

    expect(result.actor).toBe("reviewer");
    expect(result.nextRun.mode).toBe("review");
    expect(result.completedCapabilityId).toBe("derive-under-pressure");
    expect(result.presentedReviewChallenge).toBe(true);
    // The persisted challenge stays the challenge alone; the learner-facing
    // reply carries the mentor's handoff in front of it.
    const challengePrompt = result.nextRun.activeReviewChallenge?.prompt;
    expect(challengePrompt).toBeDefined();
    expect(result.assistantMessage).toBe(
      `${mentorMessage}\n\n${challengePrompt}`,
    );
  });

  it("streams the reviewer handoff as a continuation of the mentor's message", async () => {
    const mentorMessage = "That derivation holds. Now defend it under load.";
    const streamed: string[] = [];
    await Effect.runPromise(
      runUnitTurn(
        {
          ...input(),
          onPartialAssistantMessage: (content) => streamed.push(content),
        },
        deps({
          runMentor: ({ onPartialAssistantMessage }) => {
            onPartialAssistantMessage?.(mentorMessage);
            return Effect.succeed({
              object: {
                assistantMessage: mentorMessage,
                completedCapabilityId: "derive-under-pressure",
              },
            });
          },
          runReviewPresentation: ({ onPartialAssistantMessage }) => {
            onPartialAssistantMessage?.("The production constraint changed.");
            return Effect.succeed({
              object: {
                assistantMessage:
                  "The production constraint changed. Choose the next move and defend it.",
              },
            });
          },
        }),
      ),
    );

    // Every snapshot extends the previous one, so the stream never has to
    // retract text the learner has already read.
    expect(streamed).toEqual([
      mentorMessage,
      `${mentorMessage}\n\nThe production constraint changed.`,
    ]);
  });

  it("opens the next pass when a Pass 1 grade finds a gap", async () => {
    const opened = await Effect.runPromise(
      runUnitTurn(
        input(),
        deps({
          runMentor: () =>
            Effect.succeed({
              object: {
                assistantMessage: "Now test it independently.",
                completedCapabilityId: "derive-under-pressure",
              },
            }),
        }),
      ),
    );
    const graded = await Effect.runPromise(
      runUnitTurn(input(opened.nextRun), deps()),
    );

    // Pass 1 cannot end the unit, so a gap simply parks the next scenario.
    expect(graded.nextRun.mode).toBe("awaiting_next_pass");
    expect(graded.nextRun.reviewPass).toBe(2);
    expect(graded.settledPass).toBe(1);
    expect(graded.reviewGrade?.passed).toBe(false);
    expect(graded.reviewGrade?.errorCodes).toEqual([
      "gap:derive-under-pressure",
    ]);
    expect(graded.ratingWrite).toBeNull();
  });

  it("holds after Pass 1, opens Pass 2, and rates only the decisive mark", async () => {
    const opened = await Effect.runPromise(
      runUnitTurn(
        input(),
        deps({
          runMentor: () =>
            Effect.succeed({
              object: {
                assistantMessage:
                  "You derived the mechanism, so now test it under pressure.",
                completedCapabilityId: "derive-under-pressure",
              },
            }),
        }),
      ),
    );
    const settledPass1 = await Effect.runPromise(
      runUnitTurn(
        input(opened.nextRun),
        deps({
          runReviewGrade: () =>
            Effect.succeed({
              object: {
                assistantMessage:
                  "You re-derived and defended the decision under the new pressure.",
                errorCodes: [],
                gradeReasoning:
                  "The learner used the mechanism and remained stable under pressure.",
                dimensionResults: [
                  {
                    dimensionId: "derive-under-pressure",
                    score: 88,
                    evidence: "I would derive it again.",
                    missing: null,
                  },
                ],
              },
            }),
        }),
      ),
    );

    // A clean Pass 1 still cannot finish the unit.
    expect(settledPass1.nextRun.mode).toBe("awaiting_next_pass");
    expect(settledPass1.settledPass).toBe(1);
    expect(settledPass1.ratingWrite).toBeNull();

    const pass2Prompt =
      "Transfer the same judgment to a different production system.";
    const advanced = await Effect.runPromise(
      runPassAdvanceTurn(
        input(settledPass1.nextRun),
        deps({
          runReviewPresentation: () =>
            Effect.succeed({ object: { assistantMessage: pass2Prompt } }),
        }),
      ),
    );

    expect(advanced.nextRun).toMatchObject({
      mode: "review",
      reviewPass: 2,
      activeReviewChallenge: {
        prompt: pass2Prompt,
        difficultyVector,
        contract: {
          runKind: "education",
          testedDimensions: [{ dimensionId: "derive-under-pressure" }],
        },
      },
    });

    const passed = await Effect.runPromise(
      runUnitTurn(
        input(advanced.nextRun),
        deps({
          runReviewGrade: () =>
            Effect.succeed({
              object: {
                assistantMessage:
                  "The judgment transferred cleanly to the new system.",
                errorCodes: [],
                gradeReasoning:
                  "The learner independently transferred the causal mechanism.",
                dimensionResults: [
                  {
                    dimensionId: "derive-under-pressure",
                    score: 91,
                    evidence: "I would derive it again.",
                    missing: null,
                  },
                ],
              },
            }),
        }),
      ),
    );

    expect(passed.nextRun.mode).toBe("complete");
    expect(passed.settledPass).toBe(2);
    expect(passed.ratingWrite).toEqual({ score: 91, errorCodes: [] });
  });

  it("replays a pre-generated challenge without another model call", async () => {
    const preparedChallenge = {
      prompt: "Diagnose the same constraint on an unfamiliar system.",
      difficultyVector,
      contract: challengeContract,
    };
    const opened = await Effect.runPromise(
      runUnitTurn(
        input(),
        deps({
          runMentor: () =>
            Effect.succeed({
              object: {
                assistantMessage: "Now test it independently.",
                completedCapabilityId: "derive-under-pressure",
              },
            }),
        }),
      ),
    );
    const answered = await Effect.runPromise(
      runUnitTurn(input(opened.nextRun), deps()),
    );
    const parked = await Effect.runPromise(
      attachChallenge({
        run: answered.nextRun,
        challenge: preparedChallenge,
      }),
    );

    let presentationCalls = 0;
    const advanced = await Effect.runPromise(
      runPassAdvanceTurn(
        input(parked),
        deps({
          runReviewPresentation: () => {
            presentationCalls += 1;
            return Effect.succeed({
              object: {
                assistantMessage: "Unexpected model-authored challenge.",
              },
            });
          },
        }),
      ),
    );

    expect(presentationCalls).toBe(0);
    expect(advanced.nextRun).toMatchObject({
      mode: "review",
      reviewPass: 2,
      activeReviewChallenge: preparedChallenge,
    });
    expect(advanced.assistantMessage).toBe(preparedChallenge.prompt);
  });
});
