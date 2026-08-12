import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import type { UnitReviewChallenge } from "@acme/validators";
import { UnitContextSchema } from "@acme/validators";

import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";
import { makeUnitContext } from "./unit-context.fixture";
import {
  assertInteractionId,
  attachPreparedScenario,
  createUnitRun,
  presentScenario,
  repeatTeachback,
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
  it("starts education at teachback with a deterministic initial identity", () => {
    const first = makeRun();
    const sameProjection = makeRun();
    expect(first.cursor.step).toEqual({
      kind: "teachback",
      preparedScenario: null,
    });
    expect(first.cursor.interactionId).toBe(
      sameProjection.cursor.interactionId,
    );
    expect(first.mode).toBe("learning");
  });

  it("rejects a response to an interaction that is no longer current", async () => {
    const run = makeRun();
    const repeated = await Effect.runPromise(repeatTeachback(run));
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
      kind: "teachback",
      preparedScenario: challenge,
    });
  });

  it("moves teachback to a presented scenario and records its surface", async () => {
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
    const feedback = await Effect.runPromise(
      settleScenario({
        run: scenario,
        passed: false,
        errorCodes: ["constraint_blindness"],
        dimensionResults: [
          {
            dimensionId: "derive-under-pressure",
            score: 55,
            evidence: "repeat the old move",
            missing: "A derivation from the changed constraint.",
          },
        ],
        evidencedTargetIds: [],
      }),
    );
    expect(feedback.cursor.step).toMatchObject({
      kind: "feedback",
      attempt: 1,
      errorCodes: ["constraint_blindness"],
    });
    expect(feedback.mode).toBe("awaiting_next_pass");
  });

  it("completes with only the targets supported by reviewer evidence", async () => {
    const scenario = await Effect.runPromise(
      presentScenario({ run: makeRun(), challenge }),
    );
    const complete = await Effect.runPromise(
      settleScenario({
        run: scenario,
        passed: true,
        errorCodes: [],
        dimensionResults: [
          {
            dimensionId: "derive-under-pressure",
            score: 92,
            evidence: "derive from the changed constraint",
            missing: null,
          },
        ],
        evidencedTargetIds: ["target-1"],
      }),
    );
    expect(complete.cursor.step).toMatchObject({
      kind: "complete",
      outcome: "pass",
      evidencedTargetIds: ["target-1"],
    });
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
        dimensionResults: [
          {
            dimensionId: "derive-under-pressure",
            score: 92,
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
        dimensionResults: [],
        evidencedTargetIds: [],
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe("unit context coverage", () => {
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
