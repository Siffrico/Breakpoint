import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { UnitTurnDependencies } from "./run-unit-turn";
import type { PersistedUnitRun } from "./unit-state";
import { UnitAgentTransientProviderError } from "./agent-errors";
import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";
import { runPassAdvanceTurn, runUnitTurn } from "./run-unit-turn";
import { makeUnitContext } from "./unit-context.fixture";
import { createUnitRun, presentScenario } from "./unit-state";

const challenge = {
  prompt:
    "The production constraint changed. Choose the next move and defend it from the controlling mechanism.",
  difficultyVector: {
    formatId: "frq",
    reasoningPathSteps: 3,
    withheldGivens: 1,
    embeddedAlternatives: 2,
  },
  contract: {
    version: 1 as const,
    runKind: "education" as const,
    scenarioPromptSummary: "Choose after a changed constraint.",
    testedCriterionIds: ["derive-under-pressure"],
    verifier: {
      type: "judge_rubric" as const,
      answer: null,
      checkerSpec: null,
      scratchpad:
        "Re-derive from the changed constraint. Repeating the old move ignores the controlling cause.",
    },
  },
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
  mentor: "Authoritative teaching context.",
  critique: {
    createChallenge: "Authoritative scenario context.",
    judgeAnswer: "Authoritative judgment context.",
  },
};

const deps = (
  overrides: Partial<UnitTurnDependencies> = {},
): UnitTurnDependencies => ({
  runMentor: () =>
    Effect.succeed({
      object: {
        assistantMessage:
          "You named the move but not the controlling cause. Which constraint makes it valid?",
        teachbackPassed: false,
      },
    }),
  runReviewPresentation: () =>
    Effect.succeed({
      object: {
        assistantMessage: challenge.prompt,
        verifier: challenge.contract.verifier,
      },
    }),
  runReviewGrade: () =>
    Effect.succeed({
      object: {
        assistantMessage:
          "**What held** You chose a plausible move. **Change** Derive it from the changed constraint. **Use next time** Name the controlling cause first.",
        errorCodes: ["constraint_blindness"],
        scratchpad:
          "The learner repeated a familiar move without causal support.",
        dimensionResults: [
          {
            dimensionId: "derive-under-pressure",
            score: 55,
            evidence: "repeat the old move",
            missing: "A derivation from the changed constraint.",
          },
        ],
      },
    }),
  ...overrides,
});

const input = (run: PersistedUnitRun) => ({
  run,
  interactionId: run.cursor.interactionId,
  transcript: [
    { role: "user" as const, content: "I would repeat the old move." },
  ],
  experience: DEFAULT_EDUCATION_EXPERIENCE,
  contexts,
});

describe("runUnitTurn", () => {
  it("rejects stale answers before invoking an agent", async () => {
    const run = makeRun();
    const runMentor = vi.fn(deps().runMentor);
    const runReviewPresentation = vi.fn(deps().runReviewPresentation);
    const exit = await Effect.runPromiseExit(
      runUnitTurn(
        { ...input(run), interactionId: "stale-interaction" },
        deps({ runMentor, runReviewPresentation }),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(runMentor).not.toHaveBeenCalled();
    expect(runReviewPresentation).not.toHaveBeenCalled();
  });

  it("prepares the scenario while the teachback is being assessed", async () => {
    interface MentorResult {
      object: { assistantMessage: string; teachbackPassed: boolean };
    }
    let releaseMentor = (_result: MentorResult) => undefined;
    const mentorPromise = new Promise<MentorResult>((resolve) => {
      releaseMentor = (result) => {
        resolve(result);
      };
    });
    const runReviewPresentation = vi.fn(deps().runReviewPresentation);
    const pending = Effect.runPromise(
      runUnitTurn(
        input(makeRun()),
        deps({
          runMentor: () => Effect.promise(() => mentorPromise),
          runReviewPresentation,
        }),
      ),
    );

    await vi.waitFor(() =>
      expect(runReviewPresentation).toHaveBeenCalledOnce(),
    );
    releaseMentor({
      object: {
        assistantMessage:
          "You named the move but not the cause. Which constraint controls it?",
        teachbackPassed: false,
      },
    });

    await expect(pending).resolves.toMatchObject({ actor: "mentor" });
  });

  it("keeps a failed teachback at teachback with a fresh identity", async () => {
    const run = makeRun();
    const result = await Effect.runPromise(runUnitTurn(input(run), deps()));
    expect(result.nextRun.cursor.step.kind).toBe("teachback");
    expect(result.nextRun.cursor.interactionId).not.toBe(
      run.cursor.interactionId,
    );
    expect(result.nextRun.cursor.step).toMatchObject({
      preparedScenario: {
        prompt: challenge.prompt,
        contract: { testedCriterionIds: ["derive-under-pressure"] },
      },
    });
  });

  it("still returns corrective teachback when speculative scenario authoring fails", async () => {
    const result = await Effect.runPromise(
      runUnitTurn(
        input(makeRun()),
        deps({
          runReviewPresentation: () =>
            Effect.fail(
              new UnitAgentTransientProviderError({
                message: "Scenario provider unavailable.",
              }),
            ),
        }),
      ),
    );

    expect(result).toMatchObject({
      actor: "mentor",
      nextRun: { cursor: { step: { kind: "teachback" } } },
    });
  });

  it("hands a passing teachback directly to the first scenario", async () => {
    const run = makeRun();
    const result = await Effect.runPromise(
      runUnitTurn(
        input(run),
        deps({
          runMentor: () =>
            Effect.succeed({
              object: {
                assistantMessage:
                  "Yes—the changed constraint is the controlling cause.",
                teachbackPassed: true,
              },
            }),
        }),
      ),
    );
    expect(result.nextRun.cursor.step).toMatchObject({
      kind: "scenario",
      attempt: 1,
    });
    expect(result.assistantMessage).toContain(challenge.prompt);
  });

  it("does not advance a passing teachback without a prepared scenario", async () => {
    const exit = await Effect.runPromiseExit(
      runUnitTurn(
        input(makeRun()),
        deps({
          runMentor: () =>
            Effect.succeed({
              object: {
                assistantMessage:
                  "Yes—the changed constraint is the controlling cause.",
                teachbackPassed: true,
              },
            }),
          runReviewPresentation: () =>
            Effect.fail(
              new UnitAgentTransientProviderError({
                message: "Scenario provider unavailable.",
              }),
            ),
        }),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("stores failed grading evidence in feedback", async () => {
    const run = await Effect.runPromise(
      presentScenario({ run: makeRun(), challenge }),
    );
    const result = await Effect.runPromise(runUnitTurn(input(run), deps()));
    expect(result.nextRun.cursor.step).toMatchObject({
      kind: "feedback",
      errorCodes: ["constraint_blindness"],
    });
  });

  it("requires all target skills to have passing evidence before completion", async () => {
    const run = await Effect.runPromise(
      presentScenario({ run: makeRun(), challenge }),
    );
    const result = await Effect.runPromise(
      runUnitTurn(
        input(run),
        deps({
          runReviewGrade: () =>
            Effect.succeed({
              object: {
                assistantMessage:
                  "The answer derives the move from the controlling constraint.",
                errorCodes: [],
                scratchpad: "All criterion and target evidence is present.",
                dimensionResults: [
                  {
                    dimensionId: "derive-under-pressure",
                    score: 92,
                    evidence: "repeat the old move",
                    missing: null,
                  },
                ],
              },
            }),
        }),
      ),
    );
    expect(result.nextRun.cursor.step).toMatchObject({
      kind: "complete",
      evidencedTargetIds: ["target-1"],
    });
  });

  it("opens a fresh second scenario only from feedback", async () => {
    const scenario = await Effect.runPromise(
      presentScenario({ run: makeRun(), challenge }),
    );
    const failed = await Effect.runPromise(
      runUnitTurn(input(scenario), deps()),
    );
    const result = await Effect.runPromise(
      runPassAdvanceTurn(
        {
          run: failed.nextRun,
          interactionId: failed.nextRun.cursor.interactionId,
          experience: DEFAULT_EDUCATION_EXPERIENCE,
          contexts,
        },
        deps(),
      ),
    );
    expect(result.nextRun.cursor.step).toMatchObject({
      kind: "scenario",
      attempt: 2,
    });
  });

  it("rejects stale feedback advances before authoring a scenario", async () => {
    const scenario = await Effect.runPromise(
      presentScenario({ run: makeRun(), challenge }),
    );
    const failed = await Effect.runPromise(
      runUnitTurn(input(scenario), deps()),
    );
    const runReviewPresentation = vi.fn(deps().runReviewPresentation);
    const exit = await Effect.runPromiseExit(
      runPassAdvanceTurn(
        {
          run: failed.nextRun,
          interactionId: "stale-interaction",
          experience: DEFAULT_EDUCATION_EXPERIENCE,
          contexts,
        },
        deps({ runReviewPresentation }),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(runReviewPresentation).not.toHaveBeenCalled();
  });
});
