import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import type { UnitReviewChallenge } from "@acme/validators";
import {
  EvaluationDimensionResultSchema,
  UnitContextSchema,
} from "@acme/validators";

import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";
import { makeUnitContext } from "./unit-context.fixture";
import {
  assertInteractionId,
  attachPreparedScenario,
  createUnitRun,
  isRatingEligibleScenario,
  presentScenario,
  repeatTeaching,
  settleScenario,
} from "./unit-state";

const challenge = {
  prompt:
    "A production constraint changed. Choose the next move and defend it from the controlling mechanism.",
  difficultyVector: {
    formatId: "frq",
    reasoningPathSteps: 3,
    withheldGivens: 1,
    embeddedAlternatives: 2,
  },
  contract: {
    version: 1,
    runKind: "education",
    scenarioPromptSummary: "Choose after a production constraint changes.",
    testedCriterionIds: ["derive-under-pressure"],
  },
} satisfies UnitReviewChallenge;

const makeRun = (kind: "education" | "recall" = "education") =>
  createUnitRun({
    unitId: "unit-1",
    sessionId: "session-1",
    userId: "user-1",
    kind,
    unitContext: makeUnitContext(),
    experience: DEFAULT_EDUCATION_EXPERIENCE,
  });

describe("unit cursor", () => {
  it("starts education at teaching with a deterministic initial identity", () => {
    const first = makeRun();
    const sameProjection = makeRun();
    expect(first.cursor.step).toEqual({
      kind: "teaching",
      preparedScenario: null,
    });
    expect(first.cursor.interactionId).toBe(
      sameProjection.cursor.interactionId,
    );
    expect(first.mode).toBe("learning");
  });

  it("rejects a response to an interaction that is no longer current", async () => {
    const run = makeRun();
    const repeated = await Effect.runPromise(repeatTeaching(run));
    const exit = await Effect.runPromiseExit(
      assertInteractionId(repeated, run.cursor.interactionId),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("parks speculative scenario work without changing the response identity", async () => {
    const run = makeRun();
    const parked = await Effect.runPromise(
      attachPreparedScenario({ run, challenge }),
    );
    expect(parked.cursor.interactionId).toBe(run.cursor.interactionId);
    expect(parked.cursor.step).toMatchObject({
      kind: "teaching",
      preparedScenario: challenge,
    });
  });

  it("moves teaching to a presented scenario and records its surface", async () => {
    const scenario = await Effect.runPromise(
      presentScenario({ run: makeRun(), challenge }),
    );
    expect(scenario.cursor.step).toMatchObject({
      kind: "scenario",
      attempt: 1,
      challenge,
    });
    expect(scenario.cursor.scenarioPrompts).toEqual([challenge.prompt]);
  });

  it("refuses to present a scenario that does not test the full unit contract", async () => {
    const exit = await Effect.runPromiseExit(
      presentScenario({
        run: makeRun(),
        challenge: {
          ...challenge,
          contract: { ...challenge.contract, testedCriterionIds: ["other"] },
        },
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("stores failed-dimension evidence as the authority for the retry", async () => {
    const scenario = await Effect.runPromise(
      presentScenario({ run: makeRun(), challenge }),
    );
    const failed = await Effect.runPromise(
      settleScenario({
        run: scenario,
        passed: false,
        errorCodes: ["constraint-blindness"],
        causeType: "missed-limit",
        hypothesis:
          "I think you read the old move working before as it working here.",
        dimensionResults: [
          {
            dimensionId: "derive-under-pressure",
            met: false,
            evidence: "repeat the old move",
            missing: "A derivation from the changed constraint.",
          },
        ],
        evidencedTargetIds: [],
      }),
    );
    expect(failed.cursor.step).toMatchObject({
      kind: "pass_result",
      attempt: 1,
      outcome: "fail",
      errorCodes: ["constraint-blindness"],
      causeType: "missed-limit",
      evidence: [{ met: false }],
    });
    expect(failed.cursor.errorCodeHistory).toEqual(["constraint-blindness"]);
    expect(failed.mode).toBe("awaiting_next_pass");
  });

  it("settles a correct first scenario without opening feedback", async () => {
    const scenario = await Effect.runPromise(
      presentScenario({ run: makeRun(), challenge }),
    );
    const settled = await Effect.runPromise(
      settleScenario({
        run: scenario,
        passed: true,
        errorCodes: [],
        causeType: null,
        hypothesis: null,
        dimensionResults: [
          {
            dimensionId: "derive-under-pressure",
            met: true,
            evidence: "derive from the changed constraint",
            missing: null,
          },
        ],
        evidencedTargetIds: ["target-1"],
      }),
    );
    expect(settled.cursor.step).toMatchObject({
      kind: "pass_result",
      attempt: 1,
      outcome: "pass",
      evidencedTargetIds: ["target-1"],
    });
    expect(settled.mode).toBe("awaiting_next_pass");
  });

  it("requires a correct independent scenario from pass 2 onward to complete", async () => {
    const firstScenario = await Effect.runPromise(
      presentScenario({ run: makeRun(), challenge }),
    );
    const firstResult = await Effect.runPromise(
      settleScenario({
        run: firstScenario,
        passed: true,
        errorCodes: [],
        causeType: null,
        hypothesis: null,
        dimensionResults: [
          {
            dimensionId: "derive-under-pressure",
            met: true,
            evidence: "derive from the changed constraint",
            missing: null,
          },
        ],
        evidencedTargetIds: ["target-1"],
      }),
    );
    const secondScenario = await Effect.runPromise(
      presentScenario({ run: firstResult, challenge }),
    );
    expect(isRatingEligibleScenario(firstScenario)).toBe(false);
    expect(isRatingEligibleScenario(secondScenario)).toBe(true);
    const complete = await Effect.runPromise(
      settleScenario({
        run: secondScenario,
        passed: true,
        errorCodes: [],
        causeType: null,
        hypothesis: null,
        dimensionResults: [
          {
            dimensionId: "derive-under-pressure",
            met: true,
            evidence: "derive from the changed constraint",
            missing: null,
          },
        ],
        evidencedTargetIds: ["target-1"],
      }),
    );
    expect(secondScenario.reviewPass).toBe(2);
    expect(complete.cursor.step).toMatchObject({
      kind: "complete",
      attempt: 2,
      outcome: "pass",
    });
  });

  it("carries the diagnosis into the failed pass so the next scenario can aim at it", async () => {
    const scenario = await Effect.runPromise(
      presentScenario({ run: makeRun(), challenge }),
    );
    const failed = await Effect.runPromise(
      settleScenario({
        run: scenario,
        passed: false,
        errorCodes: ["constraint-blindness"],
        causeType: "never-learned-it",
        hypothesis:
          "I think you read the old move working before as it working here.",
        dimensionResults: [
          {
            dimensionId: "derive-under-pressure",
            met: false,
            evidence: "repeat the old move",
            missing: "A derivation from the changed constraint.",
          },
        ],
        evidencedTargetIds: [],
      }),
    );
    expect(failed.cursor.step).toMatchObject({
      kind: "pass_result",
      outcome: "fail",
      causeType: "never-learned-it",
      hypothesis:
        "I think you read the old move working before as it working here.",
    });
  });

  it("keeps one code for a mistake the learner repeats", async () => {
    let run = await Effect.runPromise(
      presentScenario({ run: makeRun(), challenge }),
    );
    const fail = (target: typeof run) =>
      settleScenario({
        run: target,
        passed: false,
        errorCodes: ["constraint-blindness"],
        causeType: "missed-limit",
        hypothesis:
          "I think you read the old move working before as it working here.",
        dimensionResults: [
          {
            dimensionId: "derive-under-pressure",
            met: false,
            evidence: "repeat the old move",
            missing: "A derivation from the changed constraint.",
          },
        ],
        evidencedTargetIds: [],
      });
    run = await Effect.runPromise(fail(run));
    run = await Effect.runPromise(presentScenario({ run, challenge }));
    run = await Effect.runPromise(fail(run));

    expect(run.cursor.errorCodeHistory).toEqual(["constraint-blindness"]);
  });

  it("refuses a passing completion without evidence for every target", async () => {
    const scenario = await Effect.runPromise(
      presentScenario({ run: makeRun(), challenge }),
    );
    const exit = await Effect.runPromiseExit(
      settleScenario({
        run: scenario,
        passed: true,
        errorCodes: [],
        causeType: null,
        hypothesis: null,
        dimensionResults: [
          {
            dimensionId: "derive-under-pressure",
            met: true,
            evidence: "derive from the changed constraint",
            missing: null,
          },
        ],
        evidencedTargetIds: [],
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("refuses failed feedback without a diagnosis for the retry", async () => {
    const scenario = await Effect.runPromise(
      presentScenario({ run: makeRun(), challenge }),
    );
    const exit = await Effect.runPromiseExit(
      settleScenario({
        run: scenario,
        passed: false,
        errorCodes: [],
        causeType: null,
        hypothesis: null,
        dimensionResults: [],
        evidencedTargetIds: [],
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe("unit context coverage", () => {
  it("reads legacy score evidence as a boolean check result", () => {
    expect(
      EvaluationDimensionResultSchema.parse({
        dimensionId: "derive-under-pressure",
        score: 70,
        evidence: "The changed constraint controls the move.",
        missing: null,
      }),
    ).toEqual({
      dimensionId: "derive-under-pressure",
      met: true,
      evidence: "The changed constraint controls the move.",
      missing: null,
    });
  });

  it("accepts a target that is both practiced and judged", () => {
    expect(UnitContextSchema.safeParse(makeUnitContext()).success).toBe(true);
  });

  it("rejects a target that no judgment criterion measures", () => {
    const context = makeUnitContext();
    expect(
      UnitContextSchema.safeParse({
        ...context,
        judgment: {
          ...context.judgment,
          criteria: context.judgment.criteria.map((criterion) => ({
            ...criterion,
            skills: ["A different skill"],
          })),
        },
      }).success,
    ).toBe(false);
  });

  it("rejects a target that no scenario task practices", () => {
    const context = makeUnitContext();
    expect(
      UnitContextSchema.safeParse({
        ...context,
        testing: {
          ...context.testing,
          taskTypes: context.testing.taskTypes.map((task) => ({
            ...task,
            skills: ["A different skill"],
          })),
        },
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate target and criterion identities", () => {
    const context = makeUnitContext();
    expect(
      UnitContextSchema.safeParse({
        ...context,
        targets: [context.targets[0], context.targets[0]],
      }).success,
    ).toBe(false);
    expect(
      UnitContextSchema.safeParse({
        ...context,
        judgment: {
          ...context.judgment,
          criteria: [
            context.judgment.criteria[0],
            context.judgment.criteria[0],
          ],
        },
      }).success,
    ).toBe(false);
  });
});
