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
  mentor: "Authoritative mentor teaching context.",
  mentorScenario: "Authoritative mentor scenario context.",
  critique: { judgeAnswer: "Authoritative critique judgment context." },
};

const verifier = {
  type: "judge_rubric" as const,
  answer: null,
  checkerSpec: null,
  scratchpad:
    "Expert move follows the changed constraint. The familiar move ignores it.",
};

const scenario = {
  assistantMessage:
    "A production limit changes after a familiar deployment. Choose the next move and defend it from the controlling constraint.",
  verifier,
};

const teachingOpening = {
  assistantMessage:
    "Read the changed constraint before you reuse the old move. A familiar case can trick you into copying yesterday's procedure, but the new limit changes what stays safe. Which detail must you check before you reuse the old move?",
  scratchpad: "Teach the controlling constraint with a concrete contrast.",
  preparedScenario: null,
};

const teachingHandoff = {
  assistantMessage: "Exactly. Read the changed limit before reusing the move.",
  scratchpad: "The learner identified the controlling constraint.",
  preparedScenario: scenario,
};

const deps = (
  overrides: Partial<UnitTurnDependencies> = {},
): UnitTurnDependencies => ({
  runMentorTeaching: ({ createScenario }) =>
    Effect.succeed({
      object: createScenario ? teachingHandoff : teachingOpening,
    }),
  runMentorScenario: () =>
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
          "You protected the familiar procedure, but the changed limit makes it unsafe. Which limit must control the move?",
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

const startTeaching = () =>
  Effect.runPromise(runUnitTurn(input(makeRun(), "start_unit"), deps()));

const openFirstScenario = async () => {
  const started = await startTeaching();
  return Effect.runPromise(
    runUnitTurn(
      {
        ...input(started.nextRun),
        transcript: [{ role: "user", content: "Read the changed limit." }],
      },
      deps(),
    ),
  );
};

describe("runUnitTurn mentor and critique boundaries", () => {
  it("rejects a stale interaction before calling the mentor", async () => {
    const runMentorTeaching = vi.fn(deps().runMentorTeaching);
    await expect(
      Effect.runPromise(
        runUnitTurn(
          { ...input(makeRun(), "start_unit"), interactionId: "stale" },
          deps({ runMentorTeaching }),
        ),
      ),
    ).rejects.toThrow("no longer active");
    expect(runMentorTeaching).not.toHaveBeenCalled();
  });

  it("teaches first without generating a scenario", async () => {
    const runMentorTeaching = vi.fn(deps().runMentorTeaching);
    const runMentorScenario = vi.fn(deps().runMentorScenario);
    const result = await Effect.runPromise(
      runUnitTurn(
        input(makeRun(), "start_unit"),
        deps({ runMentorTeaching, runMentorScenario }),
      ),
    );

    expect(result.nextRun.cursor.step).toEqual({
      kind: "teaching",
      preparedScenario: null,
    });
    expect(runMentorTeaching).toHaveBeenCalledWith(
      expect.objectContaining({ createScenario: false }),
    );
    expect(runMentorScenario).not.toHaveBeenCalled();
  });

  it("uses the learner's one teaching answer, then creates and opens Pass 1", async () => {
    const runMentorTeaching = vi.fn(deps().runMentorTeaching);
    const started = await startTeaching();
    const result = await Effect.runPromise(
      runUnitTurn(
        {
          ...input(started.nextRun),
          transcript: [{ role: "user", content: "Reuse the old move." }],
        },
        deps({ runMentorTeaching }),
      ),
    );

    expect(runMentorTeaching).toHaveBeenCalledWith(
      expect.objectContaining({ createScenario: true }),
    );
    expect(result.nextRun.cursor.step).toMatchObject({
      kind: "scenario",
      attempt: 1,
      challenge: { prompt: scenario.assistantMessage },
    });
    expect(result.assistantMessage).toContain(scenario.assistantMessage);
  });

  it("keeps critique on grading and feedback, then uses mentor for Pass 2", async () => {
    const firstScenario = await openFirstScenario();
    const graded = await Effect.runPromise(
      runUnitTurn(
        {
          ...input(firstScenario.nextRun),
          transcript: [{ role: "user", content: "I use the old move." }],
        },
        deps(),
      ),
    );
    const feedback = await Effect.runPromise(
      runUnitTurn(
        {
          ...input(graded.nextRun),
          transcript: [
            { role: "user", content: "The changed limit controls it." },
          ],
        },
        deps(),
      ),
    );
    const runMentorScenario = vi.fn(deps().runMentorScenario);
    const secondScenario = await Effect.runPromise(
      runPassAdvanceTurn(
        {
          run: feedback.nextRun,
          interactionId: feedback.nextRun.cursor.interactionId,
          experience: DEFAULT_EDUCATION_EXPERIENCE,
          contexts,
        },
        deps({ runMentorScenario }),
      ),
    );

    expect(graded.ratingWrite).toBeNull();
    expect(feedback.nextRun.cursor.step).toMatchObject({
      kind: "pass_result",
      outcome: "fail",
    });
    expect(runMentorScenario).toHaveBeenCalledWith(
      expect.objectContaining({
        pass: 2,
      }),
    );
    expect(runMentorScenario.mock.calls[0]?.[0].context).toContain(
      contexts.mentorScenario,
    );
    expect(secondScenario.nextRun.cursor.step).toMatchObject({
      kind: "scenario",
      attempt: 2,
    });
  });

  it("skips feedback after a correct scenario and completes on a correct Pass 2", async () => {
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
    const firstScenario = await openFirstScenario();
    const firstResult = await Effect.runPromise(
      runUnitTurn(
        {
          ...input(firstScenario.nextRun),
          transcript: [
            { role: "user", content: "The changed constraint controls it." },
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
            { role: "user", content: "The changed constraint controls it." },
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
    expect(complete.ratingWrite).toEqual({ score: 95, errorCodes: [] });
  });
});
