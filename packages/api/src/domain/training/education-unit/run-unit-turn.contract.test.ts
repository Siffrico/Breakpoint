import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { UnitMasteryContract } from "@acme/validators";

import type { UnitTurnDependencies } from "./run-unit-turn";
import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";
import { runUnitTurn } from "./run-unit-turn";
import { createUnitRun } from "./unit-state";

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

const baseRun = () =>
  createUnitRun({
    unitId: "unit-1",
    sessionId: "session-1",
    userId: "user-1",
    kind: "education",
    masteryContract,
    experience: DEFAULT_EDUCATION_EXPERIENCE,
  });

const input = (run = baseRun()) => ({
  run,
  masteryContract,
  transcript: [{ role: "user" as const, content: "I would derive it again." }],
  experience: DEFAULT_EDUCATION_EXPERIENCE,
  buildContext: () => "Unit context with capability and reviewer todos.",
});

const deps = (
  overrides: Partial<UnitTurnDependencies> = {},
): UnitTurnDependencies => ({
  runMentor: () =>
    Effect.succeed({
      object: {
        assistantMessage: "Try the same decision after the constraint changes.",
        completedTodo: null,
      },
    }),
  runReviewPresentation: () =>
    Effect.succeed({
      object: {
        assistantMessage:
          "The production constraint changed. Choose the next move and defend it.",
        difficultyVector,
        contract: challengeContract,
      },
    }),
  runReviewGrade: () =>
    Effect.succeed({
      object: {
        assistantMessage:
          "Your defense still copies the original rule. Try this changed case and re-derive the move.",
        verdict: "continue" as const,
        errorCodes: ["procedure-replay"],
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
        completedReviewTodos: [],
        nextChallenge: { difficultyVector, contract: challengeContract },
      },
    }),
  ...overrides,
});

describe("runUnitTurn", () => {
  it("keeps the mentor on an incomplete capability", async () => {
    const result = await Effect.runPromise(runUnitTurn(input(), deps()));

    expect(result.actor).toBe("mentor");
    expect(result.nextRun.mode).toBe("learning");
    expect(result.nextRun.capabilityTodos[0]?.status).toBe("pending");
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
                completedTodo: {
                  todoId: "derive-under-pressure",
                },
              },
            }),
        }),
      ),
    );

    expect(result.nextRun.capabilityTodos[0]).toMatchObject({
      status: "completed",
      evidence: "Completed by the mentor.",
    });
  });

  it("hands the final mentor completion directly to adversarial review", async () => {
    const result = await Effect.runPromise(
      runUnitTurn(
        input(),
        deps({
          runMentor: () =>
            Effect.succeed({
              object: {
                assistantMessage:
                  "You re-derived the move correctly from the changed constraint.",
                completedTodo: {
                  todoId: "derive-under-pressure",
                },
              },
            }),
        }),
      ),
    );

    expect(result.actor).toBe("reviewer");
    expect(result.nextRun.mode).toBe("review");
    expect(result.nextRun.activeReviewChallenge?.prompt).toBe(
      result.assistantMessage,
    );
    expect(result.presentedReviewChallenge).toBe(true);
  });

  it("requires a second adversarial pressure test before review can pass", async () => {
    const opened = await Effect.runPromise(
      runUnitTurn(
        input(),
        deps({
          runMentor: () =>
            Effect.succeed({
              object: {
                assistantMessage: "Now test it independently.",
                completedTodo: {
                  todoId: "derive-under-pressure",
                },
              },
            }),
        }),
      ),
    );
    const error = await Effect.runPromise(
      runUnitTurn(
        input(opened.nextRun),
        deps({
          runReviewGrade: () =>
            Effect.succeed({
              object: {
                assistantMessage: "Pass.",
                verdict: "pass" as const,
                errorCodes: [],
                gradeReasoning: "The first answer was strong.",
                dimensionResults: [
                  {
                    dimensionId: "derive-under-pressure",
                    score: 90,
                    evidence: "I would derive it again.",
                    missing: null,
                  },
                ],
                completedReviewTodos:
                  DEFAULT_EDUCATION_EXPERIENCE.reviewer.todos.map((todo) => ({
                    todoId: todo.id,
                    evidence: `Evidence for ${todo.id}.`,
                  })),
                nextChallenge: null,
              },
            }),
        }),
      ).pipe(Effect.flip),
    );

    expect(error.message).toContain("first adversarial grade");
  });

  it("writes Goldilocks evidence only for the first adversarial grade", async () => {
    const opened = await Effect.runPromise(
      runUnitTurn(
        input(),
        deps({
          runMentor: () =>
            Effect.succeed({
              object: {
                assistantMessage:
                  "You derived the mechanism, so now test it under pressure.",
                completedTodo: {
                  todoId: "derive-under-pressure",
                },
              },
            }),
        }),
      ),
    );
    const firstGrade = await Effect.runPromise(
      runUnitTurn(input(opened.nextRun), deps()),
    );

    expect(firstGrade.ratingWrite).toEqual({
      score: 62,
      errorCodes: ["procedure-replay"],
    });

    const allReviewTodos = DEFAULT_EDUCATION_EXPERIENCE.reviewer.todos.map(
      (todo) => ({
        todoId: todo.id,
        evidence: `The learner supplied concrete evidence for ${todo.id}.`,
      }),
    );
    const passed = await Effect.runPromise(
      runUnitTurn(
        input(firstGrade.nextRun),
        deps({
          runReviewGrade: () =>
            Effect.succeed({
              object: {
                assistantMessage:
                  "You re-derived and defended the decision under the new pressure.",
                verdict: "pass" as const,
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
                completedReviewTodos: allReviewTodos,
                nextChallenge: null,
              },
            }),
        }),
      ),
    );

    expect(passed.nextRun.mode).toBe("complete");
    expect(passed.ratingWrite).toBeNull();
  });
});
