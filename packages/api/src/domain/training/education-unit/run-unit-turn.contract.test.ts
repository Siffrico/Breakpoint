import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { UnitTurnDependencies } from "./run-unit-turn";
import type { PersistedUnitRun } from "./unit-state";
import {
  makeDeps as makePreparationDeps,
  node,
  unit,
} from "../unit-preparation/preparation.fixture";
import { prepareUnitContent } from "../unit-preparation/prepare-unit-content";
import { resolveUnitRunProjection } from "../workspace-ai/workspace-turn";
import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";
import { runPassAdvanceTurn, runUnitTurn } from "./run-unit-turn";
import { createMentorContext } from "./unit-context";
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
  kind: "checks" as const,
  checks: [
    {
      criterionId: "derive-under-pressure",
      check: "The answer must derive the move from the changed constraint.",
    },
  ],
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

const gappedGrade = (
  causeType:
    | "wrong-rule"
    | "missed-limit"
    | "never-learned-it" = "missed-limit",
) => ({
  closingMessage: null,
  diagnosis: {
    quote: "I use the old move",
    hypothesis:
      "I think you read the old move working before as it working here.",
    explanation:
      "The old move was safe because the line ran above 40 degrees. This line runs at 30 degrees, so that no longer holds.",
  },
  causeType,
  errorCodes: ["constraint-blindness"],
  scratchpad:
    "The learner reused a move without re-deriving from the changed limit.",
  dimensionResults: [
    {
      dimensionId: "derive-under-pressure",
      met: false,
      evidence: "old move",
      missing: "A move derived from the changed constraint.",
    },
  ],
});

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
  runReviewGrade: () => Effect.succeed({ object: gappedGrade() }),
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

  it("opens a freshly prepared assignment directly in the live mentor", async () => {
    const preparationDeps = makePreparationDeps({
      createUnitContentIfAbsent: (assignment) =>
        Promise.resolve({ ...unit, ...assignment }),
    });
    const prepared = await Effect.runPromise(
      prepareUnitContent({
        node,
        sessionId: "session-1",
        deps: preparationDeps,
      }),
    );
    const projected = resolveUnitRunProjection({
      sessionId: "session-1",
      unit: prepared,
      existing: null,
    });
    const difficulty = makeRun().difficultySnapshot;
    if (!difficulty) throw new Error("Expected calibrated difficulty.");
    const mentorContext = createMentorContext({
      unitContext: projected.unitContext,
      difficulty,
      memories: [],
    });
    const runMentorTeaching = vi.fn(deps().runMentorTeaching);
    const result = await Effect.runPromise(
      runUnitTurn(
        {
          ...input(
            { ...projected, difficultySnapshot: difficulty },
            "start_unit",
          ),
          contexts: { ...contexts, mentor: mentorContext },
        },
        deps({ runMentorTeaching }),
      ),
    );

    expect(prepared).not.toHaveProperty("seedPrompt");
    expect(mentorContext).toContain("Causal probe");
    expect(result.assistantMessage).toBe(teachingOpening.assistantMessage);
    expect(result.nextRun.unitContext).toEqual(prepared.unitContext);
    expect(result.nextRun.cursor.step).toEqual({
      kind: "teaching",
      preparedScenario: null,
    });
    expect(runMentorTeaching).toHaveBeenCalledWith(
      expect.objectContaining({
        context: mentorContext,
        createScenario: false,
      }),
    );
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

  it("settles a failed scenario straight to the next pass, with no chat round", async () => {
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
    const onPartialAssistantMessage = vi.fn();
    const runMentorScenario = vi.fn<UnitTurnDependencies["runMentorScenario"]>(
      (request) =>
        Effect.sync(() => {
          request.onPartialAssistantMessage?.("A different production limit");
          request.onPartialAssistantMessage?.(
            "A different production limit changes.",
          );
          return {
            object: {
              assistantMessage:
                "A different production limit changes. Choose the next move and defend it.",
              verifier,
            },
          };
        }),
    );
    const secondScenario = await Effect.runPromise(
      runPassAdvanceTurn(
        {
          run: graded.nextRun,
          interactionId: graded.nextRun.cursor.interactionId,
          transcript: [],
          experience: DEFAULT_EDUCATION_EXPERIENCE,
          contexts,
          onPartialAssistantMessage,
        },
        deps({ runMentorScenario }),
      ),
    );

    expect(graded.ratingWrite).toBeNull();
    expect(graded.nextRun.cursor.step).toMatchObject({
      kind: "pass_result",
      outcome: "fail",
      causeType: "missed-limit",
    });
    expect(graded.assistantMessage).toBe(
      `> I use the old move

I think you read the old move working before as it working here.

The old move was safe because the line ran above 40 degrees. This line runs at 30 degrees, so that no longer holds.`,
    );
    expect(runMentorScenario).toHaveBeenCalledWith(
      expect.objectContaining({
        pass: 2,
      }),
    );
    expect(runMentorScenario.mock.calls[0]?.[0].context).toContain(
      contexts.mentorScenario,
    );
    expect(onPartialAssistantMessage).toHaveBeenNthCalledWith(
      1,
      "A different production limit",
    );
    expect(onPartialAssistantMessage).toHaveBeenNthCalledWith(
      2,
      "A different production limit changes.",
    );
    expect(secondScenario.nextRun.cursor.step).toMatchObject({
      kind: "scenario",
      attempt: 2,
    });
  });

  it("re-teaches instead of retesting when the idea was never taught", async () => {
    const runMentorTeaching = vi.fn(deps().runMentorTeaching);
    const runMentorScenario = vi.fn(deps().runMentorScenario);
    const firstScenario = await openFirstScenario();
    const graded = await Effect.runPromise(
      runUnitTurn(
        {
          ...input(firstScenario.nextRun),
          transcript: [{ role: "user", content: "I use the old move." }],
        },
        deps({
          runReviewGrade: () =>
            Effect.succeed({ object: gappedGrade("never-learned-it") }),
        }),
      ),
    );
    const advanced = await Effect.runPromise(
      runPassAdvanceTurn(
        {
          run: graded.nextRun,
          interactionId: graded.nextRun.cursor.interactionId,
          transcript: [],
          experience: DEFAULT_EDUCATION_EXPERIENCE,
          contexts,
        },
        deps({ runMentorTeaching, runMentorScenario }),
      ),
    );

    expect(runMentorTeaching).toHaveBeenCalledWith(
      expect.objectContaining({ createScenario: true }),
    );
    expect(runMentorScenario).not.toHaveBeenCalled();
    expect(advanced.assistantMessage).toContain(
      teachingHandoff.assistantMessage,
    );
    expect(advanced.nextRun.cursor.step).toMatchObject({
      kind: "scenario",
      attempt: 2,
    });
  });

  it("completes on a correct Pass 2", async () => {
    const cleanGrade = () =>
      Effect.succeed({
        object: {
          closingMessage:
            "Exactly right: the changed constraint controls the safe move.",
          diagnosis: null,
          causeType: null,
          errorCodes: [],
          scratchpad: "No material divergence.",
          dimensionResults: [
            {
              dimensionId: "derive-under-pressure" as const,
              met: true,
              evidence: "changed constraint",
              missing: null,
            },
          ],
        },
      });
    const firstScenario = await openFirstScenario();
    const firstResult = await Effect.runPromise(
      runUnitTurn(
        {
          ...input(firstScenario.nextRun),
          transcript: [
            { role: "user", content: "The changed constraint controls it." },
          ],
        },
        deps({ runReviewGrade: cleanGrade }),
      ),
    );
    expect(firstResult.nextRun.cursor.step).toMatchObject({
      kind: "pass_result",
      attempt: 1,
      outcome: "pass",
    });

    const secondScenario = await Effect.runPromise(
      runPassAdvanceTurn(
        {
          run: firstResult.nextRun,
          interactionId: firstResult.nextRun.cursor.interactionId,
          transcript: [],
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
    expect(complete.ratingWrite).toEqual({
      checksMet: 1,
      checksTotal: 1,
      errorCodes: [],
    });
  });

  it.each([
    { answer: "C", met: true },
    { answer: "A timeout is the issue; I choose C.", met: true },
    { answer: "C is wrong; my answer is B.", met: false },
    { answer: "C, because we can ignore the changed constraint.", met: false },
    { answer: "A", met: false },
  ])(
    "lets the critic read the whole selected response: $answer",
    async ({ answer, met }) => {
      const firstScenario = await openFirstScenario();
      const step = firstScenario.nextRun.cursor.step;
      if (step.kind !== "scenario" || step.challenge === null) {
        throw new Error("Expected an active scenario.");
      }
      const difficultySnapshot = firstScenario.nextRun.difficultySnapshot;
      if (difficultySnapshot === null) {
        throw new Error("Expected a difficulty snapshot.");
      }
      const selectedRun: PersistedUnitRun = {
        ...firstScenario.nextRun,
        difficultySnapshot: {
          ...difficultySnapshot,
          format: {
            id: "selected-response",
            label: "Selected response",
            kind: "mcq",
            description: "Choose one option.",
          },
        },
        cursor: {
          ...firstScenario.nextRun.cursor,
          step: {
            ...step,
            attempt: 2,
            challenge: {
              ...step.challenge,
              contract: {
                ...step.challenge.contract,
                verifier: {
                  kind: "fixed_answer",
                  answer: "C",
                  scratchpad: "C is the only supported option.",
                },
              },
            },
          },
        },
      };
      const onPartialAssistantMessage = vi.fn();
      const grade = {
        closingMessage: met
          ? "Your choice follows the controlling constraint."
          : null,
        diagnosis: met
          ? null
          : {
              quote: answer,
              hypothesis: "I think you chose the familiar move.",
              explanation: "That move violates the changed constraint.",
            },
        causeType: met ? null : ("missed-limit" as const),
        errorCodes: met ? [] : ["wrong-option"],
        scratchpad: "Read the whole answer against the private verifier.",
        dimensionResults: [
          {
            dimensionId: "derive-under-pressure",
            met,
            evidence: answer,
            missing: met
              ? null
              : "A move that respects the changed constraint.",
          },
        ],
      };
      const runReviewGrade = vi.fn<UnitTurnDependencies["runReviewGrade"]>(
        (request) =>
          Effect.sync(() => {
            request.onPartialAssistantMessage?.("Your choice");
            return { object: grade };
          }),
      );
      const result = await Effect.runPromise(
        runUnitTurn(
          {
            ...input(selectedRun),
            transcript: [
              {
                role: "assistant",
                content: "Check the changed constraint first.",
              },
              { role: "user", content: answer },
            ],
            onPartialAssistantMessage,
          },
          deps({ runReviewGrade }),
        ),
      );

      expect(runReviewGrade).toHaveBeenCalledOnce();
      const request = runReviewGrade.mock.calls[0]?.[0];
      expect(request?.messages).toEqual([{ role: "user", content: answer }]);
      expect(request?.teachingHistory).toEqual([
        { role: "assistant", content: "Check the changed constraint first." },
      ]);
      expect(request?.activeChallenge.contract.verifier).toMatchObject({
        kind: "fixed_answer",
        answer: "C",
      });
      expect(request?.shape).toEqual({
        testedDimensionIds: ["derive-under-pressure"],
        learnerAnswer: answer,
      });
      expect(onPartialAssistantMessage).toHaveBeenCalledWith("Your choice");
      expect(result.reviewGrade).toMatchObject({
        checksMet: met ? 1 : 0,
        checksTotal: 1,
        passed: met,
      });
      expect(result.ratingWrite).toMatchObject({
        checksMet: met ? 1 : 0,
        checksTotal: 1,
      });
      expect(result.nextRun.cursor.step).toMatchObject({
        kind: met ? "complete" : "pass_result",
        outcome: met ? "pass" : "fail",
      });
    },
  );
});
