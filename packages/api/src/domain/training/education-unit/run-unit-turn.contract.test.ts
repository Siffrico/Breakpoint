import { Deferred, Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceTurnAction } from "@acme/validators";

import type { ReviewGradeOutput } from "./agent-contracts";
import type { UnitTurnDependencies, UnitTurnResult } from "./run-unit-turn";
import type { PersistedUnitRun } from "./unit-state";
import {
  makeDeps as makePreparationDeps,
  node,
  unit,
} from "../unit-preparation/preparation.fixture";
import { prepareUnitContent } from "../unit-preparation/prepare-unit-content";
import { resolveUnitRunProjection } from "../workspace-ai/workspace-turn";
import { createAssistantTextStreamer } from "../workspace-ai/assistant-text-streamer";
import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";
import { runUnitTurn } from "./run-unit-turn";
import { makeUnitContext } from "./unit-context.fixture";
import { createUnitRun, withPreparedDraft } from "./unit-state";

const CRITERION = "derive-under-pressure";
const LESSON =
  "Read the changed limit before you reuse the old move. Explain what the limit forces in a line that runs cold.";

const difficultySnapshot: NonNullable<PersistedUnitRun["difficultySnapshot"]> = {
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
  dialPreset: { steps: [3, 3], withheldGivens: [1, 1], alternatives: [2, 2] },
};

const makeRun = (): PersistedUnitRun => ({
  ...createUnitRun({
    unitId: "unit-1",
    sessionId: "session-1",
    userId: "user-1",
    kind: "education",
    unitContext: makeUnitContext(),
    experience: DEFAULT_EDUCATION_EXPERIENCE,
  }),
  difficultySnapshot,
});

const cleanGrade = (criterionIds: readonly string[]): ReviewGradeOutput => ({
  closingMessage: "Right: the limit decided the move.",
  diagnosis: null,
  causeType: null,
  errorCodes: [],
  scratchpad: "Derived from the limit.",
  dimensionResults: criterionIds.map((dimensionId) => ({
    dimensionId,
    met: true,
    evidence: "the limit",
    missing: null,
  })),
});

const gappedGrade = (
  criterionIds: readonly string[],
  causeType: "wrong-rule" | "never-learned-it" = "wrong-rule",
): ReviewGradeOutput => ({
  closingMessage: null,
  diagnosis: {
    quote: "old move",
    hypothesis: "You may be reading yesterday's success as today's rule.",
    explanation: "The old move held above 40 degrees. This line runs at 30.",
  },
  causeType,
  errorCodes: ["old-move"],
  scratchpad: "Reused the old move.",
  dimensionResults: criterionIds.map((dimensionId) => ({
    dimensionId,
    met: false,
    evidence: "old move",
    missing: "A move derived from the limit.",
  })),
});

const deps = (
  overrides: Partial<UnitTurnDependencies> = {},
): UnitTurnDependencies => ({
  runMentorLesson: () =>
    Effect.succeed({ object: { assistantMessage: LESSON } }),
  runMentorParts: ({ shape, letters }) =>
    Effect.succeed({
      object: {
        acknowledgment: shape.acknowledgesExplanation ? "Good read." : null,
        narrative: shape.opensRound
          ? "A line that ran at 45 degrees now runs at 30."
          : null,
        parts: letters.map((letter) => ({
          question: `Part ${letter}: what does the limit force?`,
          criterionIds: [...shape.roundCriterionIds],
          verifier: {
            kind: "checks" as const,
            checks: shape.roundCriterionIds.map((criterionId) => ({
              criterionId,
              check: "Derives the move from the limit.",
            })),
            scratchpad: "The limit decides the move.",
          },
        })),
      },
    }),
  runReviewGrade: ({ part }) =>
    Effect.succeed({ object: cleanGrade(part.criterionIds) }),
  ...overrides,
});

const turn = (
  run: PersistedUnitRun,
  action: WorkspaceTurnAction,
  learnerMessage = "",
  dependencies = deps(),
): Promise<UnitTurnResult> =>
  Effect.runPromise(
    runUnitTurn(
      {
        run,
        interactionId: run.cursor.interactionId,
        action,
        learnerMessage,
        experience: DEFAULT_EDUCATION_EXPERIENCE,
        memories: [],
      },
      dependencies,
    ),
  );

/** Start, explain back, and land on learn part (a). */
const openLearnRound = async (dependencies = deps()) => {
  const started = await turn(makeRun(), "start_unit", "", dependencies);
  return turn(started.nextRun, "submit_answer", "It says re-derive.", dependencies);
};

/** Play the learn round to its end with every part answered cleanly. */
const finishLearnRound = async (dependencies = deps()) => {
  let result = await openLearnRound(dependencies);
  for (let index = 0; index < 3; index += 1) {
    result = await turn(result.nextRun, "submit_answer", "the limit", dependencies);
    if (index < 2) result = await turn(result.nextRun, "continue", "", dependencies);
  }
  return result;
};

describe("runUnitTurn", () => {
  it("opens with a prepared lesson without calling the mentor", async () => {
    const runMentorLesson = vi.fn(deps().runMentorLesson);
    const run = withPreparedDraft(makeRun(), {
      kind: "lesson",
      inputKey: null,
      lesson: "Prepared lesson.",
    });
    const result = await turn(run, "start_unit", "", deps({ runMentorLesson }));
    expect(result.assistantMessage).toBe("Prepared lesson.");
    expect(result.nextRun.mode).toBe("teach");
    expect(result.nextRun.cursor.prepared).toBeNull();
    expect(result.ratingWrite).toBeNull();
    expect(runMentorLesson).not.toHaveBeenCalled();
  });

  it("rejects a stale interaction before calling the mentor", async () => {
    const runMentorLesson = vi.fn(deps().runMentorLesson);
    await expect(
      Effect.runPromise(
        runUnitTurn(
          {
            run: makeRun(),
            interactionId: "stale",
            action: "start_unit",
            learnerMessage: "",
            experience: DEFAULT_EDUCATION_EXPERIENCE,
            memories: [],
          },
          deps({ runMentorLesson }),
        ),
      ),
    ).rejects.toThrow("no longer active");
    expect(runMentorLesson).not.toHaveBeenCalled();
  });

  it("teaches a freshly prepared assignment from its own context", async () => {
    const prepared = await Effect.runPromise(
      prepareUnitContent({
        node,
        sessionId: "session-1",
        deps: makePreparationDeps({
          createUnitContentIfAbsent: (assignment) =>
            Promise.resolve({ ...unit, ...assignment }),
        }),
      }),
    );
    const projected = resolveUnitRunProjection({
      sessionId: "session-1",
      unit: prepared,
      existing: null,
    });
    const runMentorLesson = vi.fn(deps().runMentorLesson);
    const result = await turn(
      { ...projected, difficultySnapshot },
      "start_unit",
      "",
      deps({ runMentorLesson }),
    );
    expect(result.nextRun.unitContext).toEqual(prepared.unitContext);
    expect(runMentorLesson.mock.calls[0]?.[0].context).toContain(
      "Causal probe",
    );
  });

  it("answers the explain-back and opens learn part (a) in one reply", async () => {
    const runMentorParts = vi.fn(deps().runMentorParts);
    const result = await openLearnRound(deps({ runMentorParts }));
    expect(runMentorParts.mock.calls[0]?.[0]).toMatchObject({
      label: "learn",
      letters: ["a"],
      shape: { opensRound: true, acknowledgesExplanation: true, partCount: 1 },
    });
    expect(result.assistantMessage).toMatch(/^Good read\.\n\nA line that ran/);
    expect(result.assistantMessage).toContain("**Part (a)**");
    expect(result.nextRun.mode).toBe("answer");
    expect(result.nextRun.cursor.steps.at(0)).toMatchObject({
      kind: "teach",
      explanation: "It says re-derive.",
    });
    expect(result.presentedRatedRound).toBe(false);
  });

  it("gives a learn part its own feedback, unscored and unrated", async () => {
    const opened = await openLearnRound();
    const graded = await turn(opened.nextRun, "submit_answer", "the limit");
    expect(graded.assistantMessage).toBe("Right: the limit decided the move.");
    expect(graded.ratingWrite).toBeNull();
    expect(graded.nextRun.mode).toBe("feedback");
  });

  it("aims the next learn part at the last feedback's hypothesis", async () => {
    const runMentorParts = vi.fn(deps().runMentorParts);
    const dependencies = deps({
      runMentorParts,
      runReviewGrade: ({ part }) =>
        Effect.succeed({ object: gappedGrade(part.criterionIds) }),
    });
    const opened = await openLearnRound(dependencies);
    const graded = await turn(opened.nextRun, "submit_answer", "old move", dependencies);
    const next = await turn(graded.nextRun, "continue", "", dependencies);
    expect(runMentorParts.mock.calls.at(-1)?.[0]).toMatchObject({
      letters: ["b"],
      hypothesis: "You may be reading yesterday's success as today's rule.",
      shape: { opensRound: false },
    });
    expect(next.assistantMessage).toContain("**Part (b)**");
  });

  it("requires Continue after feedback", async () => {
    const opened = await openLearnRound();
    const graded = await turn(opened.nextRun, "submit_answer", "the limit");
    await expect(
      turn(graded.nextRun, "submit_answer", "more"),
    ).rejects.toThrow("Press Continue");
  });

  it("serves a prepared part on Continue without calling the mentor", async () => {
    const opened = await openLearnRound();
    const graded = await turn(opened.nextRun, "submit_answer", "the limit");
    const runMentorParts = vi.fn(deps().runMentorParts);
    const prepared = withPreparedDraft(graded.nextRun, {
      kind: "parts",
      narrative: null,
      parts: [
        {
          question: "Prepared part.",
          criterionIds: [CRITERION],
          verifier: {
            kind: "checks",
            checks: [{ criterionId: CRITERION, check: "Derives the move." }],
            scratchpad: "The limit decides the move.",
          },
        },
      ],
    });
    const next = await turn(prepared, "continue", "", deps({ runMentorParts }));
    expect(next.assistantMessage).toBe("**Part (b)**\n\nPrepared part.");
    expect(runMentorParts).not.toHaveBeenCalled();
  });

  it("presents the exam as three parts at once and marks it rated", async () => {
    const learned = await finishLearnRound();
    const exam = await turn(learned.nextRun, "continue");
    expect(exam.presentedRatedRound).toBe(true);
    expect(exam.nextRun.roundNumber).toBe(2);
    expect(exam.assistantMessage).toContain("**Part (c)**");
  });

  it("grades each exam part with its own critic and completes on a clean sweep", async () => {
    const runReviewGrade = vi.fn(deps().runReviewGrade);
    const dependencies = deps({ runReviewGrade });
    const learned = await finishLearnRound(dependencies);
    const exam = await turn(learned.nextRun, "continue", "", dependencies);
    runReviewGrade.mockClear();
    const graded = await turn(exam.nextRun, "submit_answer", "(a) the limit (b) the limit (c) the limit", dependencies);
    expect(runReviewGrade).toHaveBeenCalledTimes(3);
    expect(runReviewGrade.mock.calls.at(-1)?.[0]).toMatchObject({
      letter: "c",
      answersSeveralParts: true,
    });
    expect(graded.assistantMessage).toMatch(/^\*\*Score:\*\* 3 of 3 parts/);
    expect(graded.nextRun.cursor.outcome).toBe("mastered");
    expect(graded.nextRun.mode).toBe("complete");
    expect(graded.ratingWrite).toMatchObject({
      checksMet: 3,
      checksTotal: 3,
      partCount: 3,
    });
  });

  it("streams exam feedback in part order when critics finish out of order", async () => {
    const learned = await finishLearnRound();
    const exam = await turn(learned.nextRun, "continue");
    const aDone = Effect.runSync(Deferred.make<void>());
    const bDone = Effect.runSync(Deferred.make<void>());
    const cStreamed = Effect.runSync(Deferred.make<void>());
    // B streams and finishes first, C streams before A, A finishes before C.
    const dependencies = deps({
      runReviewGrade: ({ part, letter, onPartialAssistantMessage }) =>
        Effect.gen(function* () {
          const emit = () => onPartialAssistantMessage?.(`Feedback ${letter}.`);
          if (letter === "b") emit();
          if (letter === "c") {
            yield* Deferred.await(bDone);
            emit();
            yield* Deferred.succeed(cStreamed, undefined);
            yield* Deferred.await(aDone);
          }
          if (letter === "a") {
            yield* Deferred.await(cStreamed);
            emit();
          }
          return { object: cleanGrade(part.criterionIds) };
        }).pipe(
          Effect.tap(() =>
            letter === "a"
              ? Deferred.succeed(aDone, undefined)
              : letter === "b"
                ? Deferred.succeed(bDone, undefined)
                : Effect.void,
          ),
        ),
    });
    const chunks: { type: string; delta?: string }[] = [];
    const streamer = createAssistantTextStreamer({
      writer: { write: (chunk) => chunks.push(chunk) },
      partId: "part",
    });
    await Effect.runPromise(
      runUnitTurn(
        {
          run: exam.nextRun,
          interactionId: exam.nextRun.cursor.interactionId,
          action: "submit_answer",
          learnerMessage: "answers",
          experience: DEFAULT_EDUCATION_EXPERIENCE,
          memories: [],
          onPartialAssistantMessage: streamer.pushPartial,
        },
        dependencies,
      ),
    );
    const streamed = chunks.map((chunk) => chunk.delta ?? "").join("");
    expect(streamed).toBe(
      [
        "**Part (a)**\n\nFeedback a.",
        "**Part (b)**\n\nFeedback b.",
        "**Part (c)**\n\nFeedback c.",
      ].join("\n\n"),
    );
  });

  it("gives partial exam credit and keeps the unit going", async () => {
    let call = 0;
    const dependencies = deps({
      runReviewGrade: ({ part }) =>
        Effect.succeed({
          object:
            call++ === 4 ? gappedGrade(part.criterionIds) : cleanGrade(part.criterionIds),
        }),
    });
    const learned = await finishLearnRound(dependencies);
    const exam = await turn(learned.nextRun, "continue", "", dependencies);
    const graded = await turn(exam.nextRun, "submit_answer", "answers", dependencies);
    expect(graded.assistantMessage).toMatch(/^\*\*Score:\*\* 2 of 3 parts/);
    expect(graded.ratingWrite).toMatchObject({ checksMet: 2, checksTotal: 3 });
    expect(graded.nextRun.cursor.outcome).toBeNull();
    expect(graded.nextRun.mode).toBe("feedback");
  });

  it("re-teaches after a part shows the idea was never taught", async () => {
    const runMentorLesson = vi.fn(deps().runMentorLesson);
    const dependencies = deps({
      runMentorLesson,
      runReviewGrade: ({ part }) =>
        Effect.succeed({
          object: gappedGrade(part.criterionIds, "never-learned-it"),
        }),
    });
    const opened = await openLearnRound(dependencies);
    const graded = await turn(opened.nextRun, "submit_answer", "old move", dependencies);
    runMentorLesson.mockClear();
    const retaught = await turn(graded.nextRun, "continue", "", dependencies);
    expect(runMentorLesson.mock.calls[0]?.[0].context).toContain(
      "## Repair target",
    );
    expect(retaught.nextRun.mode).toBe("teach");
  });
});
