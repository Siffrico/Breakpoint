import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import type {
  UnitMasteryContract,
  UnitReviewChallenge,
} from "@acme/validators";

import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";
import {
  claimPass2,
  completeCurrentCapabilityTodo,
  createUnitRun,
  recordPendingPass2Challenge,
  recordReviewChallenge,
  recordTargetedExercise,
  settleReviewPass,
} from "./unit-state";

const masteryContract = {
  version: 1,
  dimensions: [
    {
      id: "explain-mechanism",
      name: "Explain the mechanism",
      description:
        "Explain what changes, what acts, and why the result follows.",
      passSignals: ["Names the causal chain"],
      failSignals: ["Only repeats the rule"],
      surrogateTraps: ["Uses terminology without a causal explanation"],
    },
    {
      id: "transfer-decision",
      name: "Transfer the decision",
      description: "Choose and defend the move in a novel realistic case.",
      passSignals: ["Uses the mechanism on a new surface"],
      failSignals: ["Copies the earlier procedure"],
      surrogateTraps: ["Matches vocabulary instead of constraints"],
    },
  ],
} satisfies UnitMasteryContract;

const challenge = {
  prompt:
    "A novel production constraint invalidates the familiar solution. Choose the next move and defend it from the mechanism.",
  difficultyVector: {
    formatId: "frq",
    reasoningPathSteps: 3,
    withheldGivens: 1,
    embeddedAlternatives: 2,
  },
  contract: {
    version: 1,
    runKind: "education",
    scenarioPromptSummary: "Choose under a novel production constraint.",
    testedDimensions: [
      {
        dimensionId: "transfer-decision",
        promptRole: "Force mechanism-based transfer.",
        expectedStrongMoves: ["Re-derives the move from the new constraint"],
        acceptableVariants: [],
        commonWrongMoves: ["Repeats the familiar procedure"],
        scoreBands: {
          strong: "Correctly derives and defends the move.",
          partial: "Chooses a plausible move with an incomplete mechanism.",
          weak: "Copies the prior move despite the changed constraint.",
        },
      },
    ],
    learnerVisibleCriteria: ["Choose one move and explain why it fits."],
    evaluatorNotes: ["Do not reward copied wording."],
  },
} satisfies UnitReviewChallenge;

const makeRun = () =>
  createUnitRun({
    unitId: "unit-1",
    sessionId: "session-1",
    userId: "user-1",
    kind: "education",
    masteryContract,
    experience: DEFAULT_EDUCATION_EXPERIENCE,
  });

const completeLearning = async () => {
  const first = await Effect.runPromise(
    completeCurrentCapabilityTodo(makeRun(), "explain-mechanism"),
  );
  return Effect.runPromise(
    completeCurrentCapabilityTodo(first, "transfer-decision"),
  );
};

describe("unit state", () => {
  it("starts education on the first pending capability", () => {
    const run = makeRun();

    expect(run.mode).toBe("learning");
    expect(run.capabilityTodos).toEqual([
      { dimensionId: "explain-mechanism", status: "pending" },
      { dimensionId: "transfer-decision", status: "pending" },
    ]);
  });

  it("snapshots capability and experience definitions for the active run", () => {
    const sourceContract = structuredClone(masteryContract);
    const sourceExperience = structuredClone(DEFAULT_EDUCATION_EXPERIENCE);
    const run = createUnitRun({
      unitId: "unit-1",
      sessionId: "session-1",
      userId: "user-1",
      kind: "education",
      masteryContract: sourceContract,
      experience: sourceExperience,
    });

    const sourceDimension = sourceContract.dimensions[0];
    if (!sourceDimension) throw new Error("Expected a source dimension.");
    sourceDimension.description = "Changed after run creation.";
    (sourceExperience.main as { instructions: string }).instructions =
      "Changed after run creation.";

    expect(run.masteryContract.dimensions[0]?.description).toBe(
      masteryContract.dimensions[0]?.description,
    );
    expect(run.experience.main.instructions).toBe(
      DEFAULT_EDUCATION_EXPERIENCE.main.instructions,
    );
  });

  it("only permits the current capability to complete", async () => {
    const exit = await Effect.runPromiseExit(
      completeCurrentCapabilityTodo(makeRun(), "transfer-decision"),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("may only complete the current");
    }
  });

  it("enters review only after every capability todo completes", async () => {
    const run = await completeLearning();

    expect(run.mode).toBe("review");
    expect(
      run.capabilityTodos.every((todo) => todo.status === "completed"),
    ).toBe(true);
  });

  it("requires a persisted challenge before grading", async () => {
    const run = await completeLearning();
    const exit = await Effect.runPromiseExit(
      settleReviewPass({
        run,
        feedback:
          "The answer needs a stronger causal defense before it is stable.",
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("settles Pass 1 without opening the Next Unit gate", async () => {
    const run = await Effect.runPromise(
      recordReviewChallenge(await completeLearning(), challenge),
    );
    const complete = await Effect.runPromise(
      settleReviewPass({
        run,
        feedback: "The learner defended and improved the work under pressure.",
      }),
    );

    expect(complete.mode).toBe("awaiting_pass2");
    expect(complete.reviewPass).toBe(1);
  });

  it("spends one repair per pass and resets it when Pass 2 opens", async () => {
    const reviewing = await Effect.runPromise(
      recordReviewChallenge(await completeLearning(), challenge),
    );
    const repaired = await Effect.runPromise(
      recordTargetedExercise({
        run: reviewing,
        feedback: "The causal boundary is still missing; repair it here.",
        exercise: challenge,
      }),
    );
    expect(repaired.repairSpent).toBe(true);

    const settled = await Effect.runPromise(
      settleReviewPass({
        run: repaired,
        feedback: "The repaired explanation now holds under pressure.",
      }),
    );
    const parked = await Effect.runPromise(
      recordPendingPass2Challenge(settled, challenge),
    );
    const pass2 = await Effect.runPromise(
      claimPass2({ run: parked, challenge }),
    );

    expect(pass2).toMatchObject({
      mode: "review",
      reviewPass: 2,
      repairSpent: false,
      pendingPass2Challenge: null,
    });
  });

  it("completes when Pass 2 settles", async () => {
    const reviewing = await Effect.runPromise(
      recordReviewChallenge(await completeLearning(), challenge),
    );
    const settled = await Effect.runPromise(
      settleReviewPass({
        run: reviewing,
        feedback: "The first pass now holds under realistic pressure.",
      }),
    );
    const pass2 = await Effect.runPromise(
      claimPass2({ run: settled, challenge }),
    );
    const complete = await Effect.runPromise(
      settleReviewPass({
        run: pass2,
        feedback: "The mechanism transferred independently on Pass 2.",
      }),
    );

    expect(complete.mode).toBe("complete");
    expect(complete.reviewPass).toBe(2);
  });
});
