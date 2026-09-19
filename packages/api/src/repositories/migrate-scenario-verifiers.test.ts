import { describe, expect, it, vi } from "vitest";

import { UnitCursorSchema } from "@acme/validators";

import {
  DEFAULT_EDUCATION_EXPERIENCE,
  snapshotEducationExperience,
} from "../domain/training/education-unit/experience";
import { makeUnitContext } from "../domain/training/education-unit/unit-context.fixture";
import {
  migrateScenarioCursor,
  migrateScenarioVerifiers,
} from "./migrate-scenario-verifiers";
import { trainingUnitRunRepository } from "./training-unit-run-repository";

const context = makeUnitContext();
const verifier = {
  type: "fixed_answer",
  answer: "C",
  checkerSpec: null,
  scratchpad: "C is the only move that respects the changed constraint.",
};
const challenge = {
  prompt: "A production constraint changed. Which move is safe now, and why?",
  difficultyVector: {
    formatId: "mcq",
    reasoningPathSteps: 3,
    withheldGivens: 1,
    embeddedAlternatives: 2,
  },
  contract: {
    version: 1,
    runKind: "education",
    scenarioPromptSummary: "Choose after a production constraint changes.",
    testedCriterionIds: ["derive-under-pressure"],
    verifier,
  },
};
const cursor = {
  interactionId: "learner-answer-still-valid",
  scenarioPrompts: [challenge.prompt],
  errorCodeHistory: ["missed-limit"],
  step: { kind: "scenario", attempt: 3, challenge },
};

const cursorWithVerifier = (
  nextVerifier:
    | typeof verifier
    | {
        type: string;
        answer: string | null;
        checkerSpec: string | null;
        scratchpad: string;
      },
) => ({
  ...cursor,
  step: {
    ...cursor.step,
    challenge: {
      ...challenge,
      contract: { ...challenge.contract, verifier: nextVerifier },
    },
  },
});

describe("saved scenario verifier migration", () => {
  it("resumes the same scenario through the repository after migration", async () => {
    expect(UnitCursorSchema.safeParse(cursor).success).toBe(false);
    const migrated = migrateScenarioCursor(cursor, context);
    const experience = snapshotEducationExperience(
      DEFAULT_EDUCATION_EXPERIENCE,
    );
    const db = {
      query: {
        TrainingUnitRun: {
          findFirst: () =>
            Promise.resolve({
              unitContentId: "unit-1",
              sessionId: "session-1",
              userId: "user-1",
              kind: "education",
              experienceId: experience.id,
              experienceVersion: experience.version,
              experienceJson: experience,
              unitContextJson: context,
              cursorJson: migrated,
              difficultySnapshotJson: null,
            }),
        },
      },
    } as unknown as Parameters<
      typeof trainingUnitRunRepository.getUnitRun
    >[0]["db"];

    const run = await trainingUnitRunRepository.getUnitRun({
      db,
      sessionId: "session-1",
      unitContentId: "unit-1",
    });
    expect(run?.mode).toBe("review");
    expect(run?.cursor).toEqual({
      ...cursor,
      step: {
        ...cursor.step,
        challenge: {
          ...challenge,
          contract: {
            ...challenge.contract,
            verifier: {
              kind: "fixed_answer",
              answer: "C",
              scratchpad: verifier.scratchpad,
            },
          },
        },
      },
    });
    expect(migrateScenarioCursor(migrated, context)).toEqual(migrated);
  });

  it.each(["teaching", "pass_result"])(
    "preserves a prepared scenario in %s",
    (kind) => {
      const step =
        kind === "teaching"
          ? { kind, preparedScenario: challenge }
          : {
              kind,
              attempt: 2,
              outcome: "fail",
              errorCodes: ["missed-limit"],
              causeType: "missed-limit",
              hypothesis: "You reused the old move.",
              evidence: [],
              evidencedTargetIds: [],
              preparedScenario: challenge,
            };
      const result = migrateScenarioCursor({ ...cursor, step }, context);
      expect(result.interactionId).toBe(cursor.interactionId);
      expect(result.step).toMatchObject({
        ...step,
        preparedScenario: {
          ...challenge,
          contract: {
            ...challenge.contract,
            verifier: {
              kind: "fixed_answer",
              answer: "C",
              scratchpad: verifier.scratchpad,
            },
          },
        },
      });
    },
  );

  it.each(["checker", "judge_rubric", "fixed_answer"])(
    "retains the complete private solution for a %s open response",
    (type) => {
      const checkerSpec =
        "Explain why the changed constraint rules out the old procedure. ".repeat(
          12,
        );
      const result = migrateScenarioCursor(
        cursorWithVerifier({
          ...verifier,
          type,
          answer: "Choose the move that preserves the limit.",
          checkerSpec,
        }),
        context,
      );
      expect(result.step).toMatchObject({
        kind: "scenario",
        attempt: 3,
        challenge: {
          contract: {
            verifier: {
              kind: "checks",
              scratchpad: verifier.scratchpad,
              checks: [
                {
                  criterionId: "derive-under-pressure",
                  check: `${context.judgment.criteria[0]?.criterion}\n\nChoose the move that preserves the limit.\n\n${checkerSpec.trim()}`,
                },
              ],
            },
          },
        },
      });
    },
  );

  it("uses the persisted judgment when the old verifier has no separate answer", () => {
    const result = migrateScenarioCursor(
      cursorWithVerifier({
        ...verifier,
        type: "judge_rubric",
        answer: null,
        checkerSpec: null,
      }),
      context,
    );
    expect(result.step).toMatchObject({
      challenge: {
        contract: {
          verifier: {
            checks: [
              {
                criterionId: "derive-under-pressure",
                check: context.judgment.criteria[0]?.criterion,
              },
            ],
          },
        },
      },
    });
  });

  it("leaves a run without a prepared scenario alone", () => {
    const stored = {
      ...cursor,
      step: { kind: "teaching", preparedScenario: null },
    };
    expect(migrateScenarioCursor(stored, context)).toEqual(stored);
  });

  it("validates every replacement before writing any run", async () => {
    const update = vi.fn();
    const tx = {
      execute: vi.fn(() => Promise.resolve()),
      query: {
        TrainingUnitRun: {
          findMany: () =>
            Promise.resolve([
              { id: "valid-run", cursorJson: cursor, unitContextJson: context },
              {
                id: "invalid-run",
                cursorJson: cursorWithVerifier({ ...verifier, scratchpad: "" }),
                unitContextJson: context,
              },
            ]),
        },
      },
      update,
    };
    const db = {
      transaction: (run: (transaction: typeof tx) => Promise<unknown>) =>
        run(tx),
    } as unknown as Parameters<typeof migrateScenarioVerifiers>[0];
    await expect(migrateScenarioVerifiers(db)).rejects.toThrow(
      "unit run invalid-run",
    );
    expect(update).not.toHaveBeenCalled();
  });
});
