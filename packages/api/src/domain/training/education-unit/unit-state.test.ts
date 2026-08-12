import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import type { UnitReviewChallenge } from "@acme/validators";

import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";
import { makeUnitContext } from "./unit-context.fixture";
import {
  attachChallenge,
  closeSolve,
  completeCurrentCapabilityTodo,
  createUnitRun,
  currentTodo,
  isDecisivePass,
  markComplete,
  presentSolve,
  TEACH_TODO_ID,
} from "./unit-state";

const unitContext = makeUnitContext({
  criterionId: "transfer-decision",
  criterion: "Choose and defend the move in a novel realistic case.",
});

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
    testedCriterionIds: ["transfer-decision"],
  },
} satisfies UnitReviewChallenge;

const makeRun = () =>
  createUnitRun({
    unitId: "unit-1",
    sessionId: "session-1",
    userId: "user-1",
    kind: "education",
    unitContext,
    experience: DEFAULT_EDUCATION_EXPERIENCE,
  });

const completeLearning = () =>
  Effect.runPromise(completeCurrentCapabilityTodo(makeRun(), TEACH_TODO_ID));

/** Answers the run's open challenge and takes the reviewer's mark. */
const answerAndMark = async (
  run: Awaited<ReturnType<typeof completeLearning>>,
  result: "pass" | "fail",
) => {
  const presented = await Effect.runPromise(presentSolve({ run, challenge }));
  const answered = await Effect.runPromise(closeSolve(presented));
  return Effect.runPromise(
    markComplete({
      run: answered,
      result,
      feedback: "The mechanism held where it mattered, and here is why.",
    }),
  );
};

describe("unit state", () => {
  it("starts education on its single teaching move", () => {
    const run = makeRun();

    expect(run.mode).toBe("learning");
    expect(currentTodo(run)).toMatchObject({
      kind: "capability",
      dimensionId: TEACH_TODO_ID,
    });
    expect(run.todos.filter((todo) => todo.kind === "capability")).toHaveLength(
      1,
    );
  });

  it("snapshots capability and experience definitions for the active run", () => {
    const sourceContext = structuredClone(unitContext);
    const sourceExperience = structuredClone(DEFAULT_EDUCATION_EXPERIENCE);
    const run = createUnitRun({
      unitId: "unit-1",
      sessionId: "session-1",
      userId: "user-1",
      kind: "education",
      unitContext: sourceContext,
      experience: sourceExperience,
    });

    const sourceTarget = sourceContext.targets[0];
    if (!sourceTarget) throw new Error("Expected a source target.");
    sourceTarget.content = "Changed after run creation.";
    (sourceExperience.main as { instructions: string }).instructions =
      "Changed after run creation.";

    expect(run.unitContext.targets[0]?.content).toBe(
      unitContext.targets[0]?.content,
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

  it("hands over to the solve once the teaching move completes", async () => {
    const run = await completeLearning();

    expect(currentTodo(run)).toMatchObject({ kind: "solve", pass: 1 });
    expect(run.mode).toBe("review");
  });

  it("refuses a mark before the challenge has been answered", async () => {
    const run = await completeLearning();
    const exit = await Effect.runPromiseExit(
      markComplete({
        run,
        result: "pass",
        feedback: "The answer needs a stronger causal defense to be stable.",
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("ends after a clean first solve and retries only after a gap", async () => {
    const learned = await completeLearning();
    expect(isDecisivePass(learned)).toBe(true);

    const complete = await answerAndMark(learned, "pass");
    expect(complete.mode).toBe("complete");

    const retry = await answerAndMark(learned, "fail");
    expect(retry.mode).toBe("awaiting_next_pass");
    expect(retry.reviewPass).toBe(2);
    expect(currentTodo(retry)).toMatchObject({ kind: "solve", pass: 2 });
  });

  it("opens another pass when a decisive mark fails", async () => {
    const pass2 = await answerAndMark(await completeLearning(), "fail");
    expect(isDecisivePass(pass2)).toBe(true);

    const pass3 = await answerAndMark(pass2, "fail");

    expect(pass3.mode).toBe("awaiting_next_pass");
    expect(pass3.reviewPass).toBe(3);
  });

  it("ends the unit when a decisive mark passes", async () => {
    const pass2 = await answerAndMark(await completeLearning(), "fail");
    const complete = await answerAndMark(pass2, "pass");

    expect(complete.mode).toBe("complete");
    expect(currentTodo(complete)).toBeNull();
    expect(complete.reviewPass).toBe(2);
  });

  it("closes a recall checkpoint on one mark, pass or fail", async () => {
    for (const result of ["pass", "fail"] as const) {
      const recall = createUnitRun({
        unitId: "unit-1",
        sessionId: "session-1",
        userId: "user-1",
        kind: "recall",
        unitContext,
        experience: DEFAULT_EDUCATION_EXPERIENCE,
      });

      expect(currentTodo(recall)).toMatchObject({ kind: "solve", pass: 1 });
      expect(isDecisivePass(recall)).toBe(true);
      const marked = await answerAndMark(recall, result);

      expect(marked.mode).toBe("complete");
      expect(currentTodo(marked)).toBeNull();
    }
  });

  it("parks a pre-generated challenge on the unopened solve", async () => {
    const pass2 = await answerAndMark(await completeLearning(), "fail");
    const parked = await Effect.runPromise(
      attachChallenge({ run: pass2, challenge }),
    );

    expect(parked.mode).toBe("awaiting_next_pass");
    expect(currentTodo(parked)).toMatchObject({ kind: "solve", challenge });
    // A second task landing on the same slot has nothing left to fill.
    expect(
      Exit.isFailure(
        await Effect.runPromiseExit(
          closeSolve(
            await Effect.runPromise(presentSolve({ run: parked, challenge })),
          ),
        ),
      ),
    ).toBe(false);
  });
});
