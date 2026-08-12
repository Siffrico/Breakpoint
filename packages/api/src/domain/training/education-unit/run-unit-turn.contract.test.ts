import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { UnitTurnDependencies } from "./run-unit-turn";
import type { PersistedUnitRun } from "./unit-state";
import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";
import { runPassAdvanceTurn, runUnitTurn } from "./run-unit-turn";
import { makeUnitContext } from "./unit-context.fixture";
import { createUnitRun } from "./unit-state";

const makeRun = (): PersistedUnitRun => ({
  ...createUnitRun({
    unitId: "unit-1",
    sessionId: "session-1",
    userId: "user-1",
    kind: "education",
    unitContext: makeUnitContext(),
    experience: DEFAULT_EDUCATION_EXPERIENCE,
  }),
  difficultySnapshot: {
    nodeId: "node-1",
    directive: {
      intent: "probe",
      bandOrder: 0,
      supportLevel: "none",
      targetItemRating: 1200,
      targetMisconceptionCode: null,
      reason: "Probe transfer.",
      nextProgress: { bandOrder: 0, supportLevel: "none" },
    },
    promptBlock: "Probe transfer.",
    ratingSnapshot: "snapshot",
    learnerRating: 1200,
    format: {
      id: "frq",
      label: "Free response",
      kind: "frq",
      description: "Explain the decision.",
    },
    dialPreset: {
      steps: [3, 3],
      withheldGivens: [1, 1],
      alternatives: [2, 2],
    },
  },
});

const contexts = {
  mentor: "Authoritative mentor context.",
  critique: {
    createChallenge: "Authoritative critique scenario context.",
    judgeAnswer: "Authoritative critique judgment context.",
  },
};

const verifier = {
  type: "judge_rubric" as const,
  answer: null,
  checkerSpec: null,
  scratchpad:
    "Expert move follows the changed constraint. The familiar move ignores it.",
};

const opening = {
  assistantMessage:
    "Read the changed constraint before you reuse the old move. A familiar case can trick you into copying yesterday's procedure, but the new limit changes what stays safe. Which detail must you check before you reuse the old move?",
  completedCapabilityId: null,
  scratchpad: "Heuristic: read the changed constraint before reusing a move.",
  preparedScenario: {
    assistantMessage:
      "A production limit changes after a familiar deployment. Choose the next move and defend it from the controlling constraint.",
    verifier,
  },
};

const deps = (
  overrides: Partial<UnitTurnDependencies> = {},
): UnitTurnDependencies => ({
  runMentorOpening: () => Effect.succeed({ object: opening }),
  runMentorCheck: () =>
    Effect.succeed({
      object: {
        assistantMessage:
          "You named the old move but not the changed limit. Which limit changes what is safe?",
        completedCapabilityId: null,
        scratchpad:
          "The learner repeated the old move without naming the changed limit.",
      },
    }),
  runReviewPresentation: () =>
    Effect.succeed({
      object: {
        assistantMessage:
          "A different production limit changes. Choose the next move and defend it.",
        verifier,
      },
    }),
  runReviewGrade: () =>
    Effect.succeed({
      object: {
        assistantMessage:
          "You protected a familiar procedure, but the changed limit makes it unsafe. Which limit must control the move?",
        errorCodes: ["constraint_blindness"],
        scratchpad:
          "The learner reused a move without re-deriving from the changed limit.",
        dimensionResults: [
          {
            dimensionId: "derive-under-pressure",
            score: 55,
            evidence: "old move",
            missing: "A move derived from the changed constraint.",
          },
        ],
      },
    }),
  runReviewFeedback: () =>
    Effect.succeed({
      object: {
        assistantMessage:
          "Yes. The changed limit must control the move, even when the old procedure is familiar.",
        feedbackComplete: true,
        scratchpad: "The learner now identified the controlling constraint.",
      },
    }),
  ...overrides,
});

const input = (run: PersistedUnitRun, action?: "start_unit") => ({
  run,
  interactionId: run.cursor.interactionId,
  ...(action ? { action } : {}),
  transcript: [],
  experience: DEFAULT_EDUCATION_EXPERIENCE,
  contexts,
});

describe("runUnitTurn mentor and critique boundaries", () => {
  it("rejects a stale interaction before calling an agent", async () => {
    const runMentorOpening = vi.fn(deps().runMentorOpening);

    await expect(
      Effect.runPromise(
        runUnitTurn(
          { ...input(makeRun(), "start_unit"), interactionId: "stale" },
          deps({ runMentorOpening }),
        ),
      ),
    ).rejects.toThrow("no longer active");
    expect(runMentorOpening).not.toHaveBeenCalled();
  });

  it("lets the mentor open the lesson and park its first scenario on teaching", async () => {
    const runReviewPresentation = vi.fn(deps().runReviewPresentation);
    const result = await Effect.runPromise(
      runUnitTurn(
        input(makeRun(), "start_unit"),
        deps({ runReviewPresentation }),
      ),
    );

    expect(result.actor).toBe("mentor");
    expect(result.nextRun.cursor.step).toMatchObject({
      kind: "teaching",
      preparedScenario: { prompt: opening.preparedScenario.assistantMessage },
    });
    expect(result.nextRun.cursor.interactionId).not.toBe(
      makeRun().cursor.interactionId,
    );
    expect(runReviewPresentation).not.toHaveBeenCalled();
  });

  it("keeps a failed comprehension answer on teaching and keeps the mentor scenario", async () => {
    const started = await Effect.runPromise(
      runUnitTurn(input(makeRun(), "start_unit"), deps()),
    );
    const result = await Effect.runPromise(
      runUnitTurn(
        {
          ...input(started.nextRun),
          transcript: [{ role: "user", content: "Reuse the old move." }],
        },
        deps(),
      ),
    );

    expect(result.nextRun.cursor.step).toMatchObject({
      kind: "teaching",
      preparedScenario: { prompt: opening.preparedScenario.assistantMessage },
    });
  });

  it("opens the mentor-owned scenario after the mini-check lands", async () => {
    const started = await Effect.runPromise(
      runUnitTurn(input(makeRun(), "start_unit"), deps()),
    );
    const result = await Effect.runPromise(
      runUnitTurn(
        {
          ...input(started.nextRun),
          transcript: [
            { role: "user", content: "Read the changed limit first." },
          ],
        },
        deps({
          runMentorCheck: () =>
            Effect.succeed({
              object: {
                assistantMessage: "Exactly. You read the changed limit first.",
                completedCapabilityId: "teach",
                scratchpad:
                  "The learner stated the command in their own words.",
              },
            }),
        }),
      ),
    );

    expect(result.nextRun.cursor.step).toMatchObject({
      kind: "scenario",
      challenge: { prompt: opening.preparedScenario.assistantMessage },
    });
    expect(result.assistantMessage).toContain(
      opening.preparedScenario.assistantMessage,
    );
  });

  it("uses the critique to open a targeted retry after a failed scenario", async () => {
    const run = await Effect.runPromise(
      runUnitTurn(input(makeRun(), "start_unit"), deps()),
    ).then((started) =>
      Effect.runPromise(
        runUnitTurn(
          {
            ...input(started.nextRun),
            transcript: [{ role: "user", content: "Read the changed limit." }],
          },
          deps({
            runMentorCheck: () =>
              Effect.succeed({
                object: {
                  assistantMessage:
                    "Exactly. You read the changed limit first.",
                  completedCapabilityId: "teach",
                  scratchpad:
                    "The learner stated the command in their own words.",
                },
              }),
          }),
        ),
      ),
    );
    const graded = await Effect.runPromise(
      runUnitTurn(
        {
          ...input(run.nextRun),
          transcript: [{ role: "user", content: "I would use the old move." }],
        },
        deps(),
      ),
    );
    const runReviewPresentation = vi.fn(deps().runReviewPresentation);
    const continuedFeedback = await Effect.runPromise(
      runUnitTurn(
        {
          ...input(graded.nextRun),
          transcript: [
            {
              role: "user",
              content: "The changed limit must control the move.",
            },
          ],
        },
        deps({
          runReviewFeedback: () =>
            Effect.succeed({
              object: {
                assistantMessage:
                  "The changed limit matters, but what does it make unsafe?",
                feedbackComplete: false,
                scratchpad:
                  "The learner named the constraint without its consequence.",
              },
            }),
        }),
      ),
    );
    const feedback = await Effect.runPromise(
      runUnitTurn(
        {
          ...input(continuedFeedback.nextRun),
          transcript: [
            {
              role: "user",
              content: "It makes the familiar procedure unsafe.",
            },
          ],
        },
        deps(),
      ),
    );
    const reopened = await Effect.runPromise(
      runPassAdvanceTurn(
        {
          run: feedback.nextRun,
          interactionId: feedback.nextRun.cursor.interactionId,
          experience: DEFAULT_EDUCATION_EXPERIENCE,
          contexts,
        },
        deps({ runReviewPresentation }),
      ),
    );

    expect(graded.nextRun.cursor.step.kind).toBe("feedback");
    expect(graded.ratingWrite).toEqual({
      score: 55,
      errorCodes: ["constraint_blindness"],
    });
    expect(continuedFeedback.nextRun.cursor.step).toMatchObject({
      kind: "feedback",
      promptRound: 2,
      errorCodes: ["constraint_blindness"],
      dimensionResults: [{ score: 55 }],
    });
    expect(continuedFeedback.ratingWrite).toBeNull();
    expect(feedback.nextRun.cursor.step).toMatchObject({
      kind: "pass_result",
      outcome: "fail",
    });
    expect(reopened.nextRun.cursor.step.kind).toBe("scenario");
    expect(reopened.nextRun.reviewPass).toBe(2);
    expect(runReviewPresentation).toHaveBeenCalledOnce();
  });

  it("skips feedback after a correct scenario and requires pass 2 to complete", async () => {
    const started = await Effect.runPromise(
      runUnitTurn(input(makeRun(), "start_unit"), deps()),
    );
    const firstScenario = await Effect.runPromise(
      runUnitTurn(
        {
          ...input(started.nextRun),
          transcript: [
            { role: "user", content: "Read the changed limit first." },
          ],
        },
        deps({
          runMentorCheck: () =>
            Effect.succeed({
              object: {
                assistantMessage: "Exactly. Read the changed limit first.",
                completedCapabilityId: "teach",
                scratchpad: "The learner stated the controlling command.",
              },
            }),
        }),
      ),
    );
    const cleanGrade = () =>
      Effect.succeed({
        object: {
          assistantMessage:
            "Exactly right: the changed constraint controls the safe move.",
          errorCodes: [],
          scratchpad: "No material divergence.",
          dimensionResults: [
            {
              dimensionId: "derive-under-pressure" as const,
              score: 95,
              evidence: "changed constraint",
              missing: null,
            },
          ],
        },
      });
    const runReviewFeedback = vi.fn(deps().runReviewFeedback);
    const firstResult = await Effect.runPromise(
      runUnitTurn(
        {
          ...input(firstScenario.nextRun),
          transcript: [
            {
              role: "user",
              content: "The changed constraint controls the move.",
            },
          ],
        },
        deps({ runReviewGrade: cleanGrade, runReviewFeedback }),
      ),
    );
    expect(firstResult.nextRun.cursor.step).toMatchObject({
      kind: "pass_result",
      attempt: 1,
      outcome: "pass",
    });
    expect(runReviewFeedback).not.toHaveBeenCalled();

    const secondScenario = await Effect.runPromise(
      runPassAdvanceTurn(
        {
          run: firstResult.nextRun,
          interactionId: firstResult.nextRun.cursor.interactionId,
          experience: DEFAULT_EDUCATION_EXPERIENCE,
          contexts,
        },
        deps(),
      ),
    );
    const complete = await Effect.runPromise(
      runUnitTurn(
        {
          ...input(secondScenario.nextRun),
          transcript: [
            {
              role: "user",
              content: "Again, the changed constraint controls the move.",
            },
          ],
        },
        deps({ runReviewGrade: cleanGrade }),
      ),
    );
    expect(complete.nextRun.cursor.step).toMatchObject({
      kind: "complete",
      attempt: 2,
      outcome: "pass",
    });
  });
});
