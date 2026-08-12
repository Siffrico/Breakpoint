import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import type { UnitTurnDependencies } from "./run-unit-turn";
import type { PersistedUnitRun } from "./unit-state";
import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";
import { UnitAgentSchemaError } from "./agent-errors";
import { runPassAdvanceTurn, runUnitTurn } from "./run-unit-turn";
import { makeUnitContext } from "./unit-context.fixture";
import { attachChallenge, createUnitRun, TEACH_TODO_ID } from "./unit-state";

const unitContext = makeUnitContext();

const challengeContract = {
  version: 1 as const,
  runKind: "education" as const,
  scenarioPromptSummary: "Choose under a changed production constraint.",
  testedCriterionIds: ["derive-under-pressure"],
};

const difficultyVector = {
  formatId: "frq",
  reasoningPathSteps: 3,
  withheldGivens: 1,
  embeddedAlternatives: 2,
};

const scenarioVerifier = {
  type: "judge_rubric" as const,
  answer: null,
  checkerSpec: null,
  scratchpad:
    "Solution: re-derive from the changed constraint. Traps: repeat the old procedure; optimize the visible symptom. Both ignore the controlling cause. Audit: self-contained and answer hidden.",
};

const baseRun = (): PersistedUnitRun => ({
  ...createUnitRun({
    unitId: "unit-1",
    sessionId: "session-1",
    userId: "user-1",
    kind: "education",
    unitContext,
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
  contexts: {
    mentor: "Unit context for teaching.",
    critique: {
      createChallenge: "Unit context for authoring the challenge.",
      judgeAnswer: "Unit context with the judgment standard.",
    },
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
        verifier: scenarioVerifier,
      },
    }),
  runReviewGrade: () =>
    Effect.succeed({
      object: {
        assistantMessage:
          "Your defense preserves the procedure that worked before, which is sensible if the controlling constraint stayed fixed. The hidden assumption is that the changed production limit does not alter which signal should drive the decision.\n\nRe-derive the move from the constraint that can invalidate the original procedure. Which step of your original defense changes first once that constraint becomes controlling?",
        errorCodes: [],
        scratchpad:
          "Optimized for the proven procedure. Assumed the changed constraint did not alter the controlling signal. Cause: constraint blindness. JIT: re-derive from the invalidating constraint.",
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
                completedCapabilityId: TEACH_TODO_ID,
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
                completedCapabilityId: TEACH_TODO_ID,
              },
            }),
        }),
      ),
    );

    expect(result.actor).toBe("reviewer");
    expect(result.nextRun.mode).toBe("review");
    expect(result.completedCapabilityId).toBe(TEACH_TODO_ID);
    expect(result.presentedReviewChallenge).toBe(true);
    // The persisted challenge stays the challenge alone; the learner-facing
    // reply carries the mentor's handoff in front of it.
    const challengePrompt = result.nextRun.activeReviewChallenge?.prompt;
    expect(challengePrompt).toBeDefined();
    expect(result.nextRun.activeReviewChallenge?.contract.verifier).toEqual(
      scenarioVerifier,
    );
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
                completedCapabilityId: TEACH_TODO_ID,
              },
            });
          },
          runReviewPresentation: ({ onPartialAssistantMessage }) => {
            onPartialAssistantMessage?.("The production constraint changed.");
            return Effect.succeed({
              object: {
                assistantMessage:
                  "The production constraint changed. Choose the next move and defend it.",
                verifier: scenarioVerifier,
              },
            });
          },
        }),
      ),
    );

    // Every snapshot extends the previous one, so the stream never has to
    // retract text the learner has already read. The scenario was authored
    // alongside the mentor, so it lands as one snapshot rather than its own
    // partials.
    expect(streamed).toEqual([
      mentorMessage,
      `${mentorMessage}\n\nThe production constraint changed. Choose the next move and defend it.`,
    ]);
  });

  it("authors the pass-1 scenario alongside the mentor, not after it", async () => {
    const order: string[] = [];
    let releaseMentor: (() => void) | undefined;
    const mentorGate = new Promise<void>((resolve) => {
      releaseMentor = resolve;
    });

    const result = await Effect.runPromise(
      runUnitTurn(
        input(),
        deps({
          runMentor: () =>
            Effect.gen(function* () {
              order.push("mentor:start");
              yield* Effect.promise(() => mentorGate);
              order.push("mentor:end");
              return {
                object: {
                  assistantMessage: "Here is the move, worked end to end.",
                  completedCapabilityId: TEACH_TODO_ID,
                },
              };
            }),
          runReviewPresentation: () =>
            Effect.sync(() => {
              // Only reachable before the mentor resolves if the two ran
              // together; a serial teach turn would deadlock on the gate.
              order.push("scenario");
              releaseMentor?.();
              return {
                object: {
                  assistantMessage:
                    "A supplier raised prices mid-cycle. Choose the next move.",
                  verifier: scenarioVerifier,
                },
              };
            }),
        }),
      ),
    );

    expect(order).toEqual(["mentor:start", "scenario", "mentor:end"]);
    expect(result.presentedReviewChallenge).toBe(true);
  });

  it("does not repeat challenge authoring after its bounded failure", async () => {
    let presentationCalls = 0;
    const result = await Effect.runPromiseExit(
      runUnitTurn(
        input(),
        deps({
          runMentor: () =>
            Effect.succeed({
              object: {
                assistantMessage: "Here is the move, worked end to end.",
                completedCapabilityId: TEACH_TODO_ID,
              },
            }),
          runReviewPresentation: () => {
            presentationCalls += 1;
            return Effect.fail(
              new UnitAgentSchemaError({
                message: "The challenge did not match its contract.",
                schemaName: "unit_review_presentation",
              }),
            );
          },
        }),
      ),
    );

    expect(Exit.isFailure(result)).toBe(true);
    expect(presentationCalls).toBe(1);
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
                completedCapabilityId: TEACH_TODO_ID,
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
                completedCapabilityId: TEACH_TODO_ID,
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
                scratchpad:
                  "No material divergence: the learner used the mechanism and remained stable under pressure.",
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
            Effect.succeed({
              object: {
                assistantMessage: pass2Prompt,
                verifier: scenarioVerifier,
              },
            }),
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
          testedCriterionIds: ["derive-under-pressure"],
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
                scratchpad:
                  "No material divergence: the learner independently transferred the causal mechanism.",
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
                completedCapabilityId: TEACH_TODO_ID,
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
                verifier: scenarioVerifier,
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
