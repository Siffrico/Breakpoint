import { describe, expect, it } from "vitest";

import type { TransitionRecipe } from "./fsm";
import type { UnitState } from "./unit";
import {
  initialState,
  isTerminal,
  shouldMicroTeach,
  shouldTeachMissedConnection,
  transition,
  writesGoldilocks,
} from "./fsm";

/** v1 shape: 2 rounds, force-advance once the grill budget is spent. */
const v1: TransitionRecipe = {
  passes: 2,
  policy: {
    maxGrillsBeforeTeach: 2,
    maxRepairsBeforeMicroTeach: 2,
    advanceOnMaxGrills: true,
  },
};

/** v2 shape: 3 rounds, connect loops forever with help escalation. */
const v2: TransitionRecipe = {
  passes: 3,
  policy: {
    maxGrillsBeforeTeach: 2,
    maxRepairsBeforeMicroTeach: 2,
    advanceOnMaxGrills: false,
  },
};

const state = (overrides: Partial<UnitState> = {}): UnitState => ({
  ...initialState("unit-1", "education-unit-v2"),
  ...overrides,
});

describe("transition", () => {
  it("orient -> connect (round 1) on teach_done", () => {
    const next = transition(
      state({ phase: "orient" }),
      { type: "teach_done" },
      v2,
    );
    expect(next).toMatchObject({ phase: "connect", pass: 1, connectGrills: 0 });
  });

  it("connect -> solve when connected", () => {
    const next = transition(
      state({ phase: "connect", pass: 1, connectGrills: 1 }),
      { type: "connection_graded", connected: true },
      v2,
    );
    expect(next).toMatchObject({ phase: "solve", pass: 1, connectGrills: 0 });
  });

  it("connect loops on itself while under the grill limit", () => {
    const next = transition(
      state({ phase: "connect", pass: 1, connectGrills: 0 }),
      { type: "connection_graded", connected: false },
      v2,
    );
    expect(next).toMatchObject({ phase: "connect", pass: 1, connectGrills: 1 });
  });

  it("connect continuation keeps state and counters unchanged", () => {
    const current = state({ phase: "connect", pass: 1, connectGrills: 1 });
    const next = transition(
      current,
      { type: "phase_continues", reason: "needs_more_work" },
      v2,
    );
    expect(next).toEqual(current);
  });

  it("v1 connect force-advances to solve once the grill limit is hit", () => {
    const next = transition(
      state({ phase: "connect", pass: 1, connectGrills: 1 }),
      { type: "connection_graded", connected: false },
      v1,
    );
    expect(next).toMatchObject({ phase: "solve", pass: 1, connectGrills: 0 });
  });

  it("v2 connect NEVER force-advances — it keeps looping past the grill limit", () => {
    let cur = state({ phase: "connect", pass: 1, connectGrills: 0 });
    for (let i = 1; i <= 5; i++) {
      cur = transition(
        cur,
        { type: "connection_graded", connected: false },
        v2,
      );
      expect(cur).toMatchObject({
        phase: "connect",
        pass: 1,
        connectGrills: i,
      });
    }
  });

  it("solve -> teach on a non-final round pass", () => {
    const next = transition(
      state({ phase: "solve", pass: 2 }),
      { type: "solution_graded", passed: true, score: 90, errorCodes: [] },
      v2,
    );
    expect(next).toMatchObject({ phase: "teach", pass: 2 });
  });

  it("solve -> mastered on the final round pass (v2: round 3)", () => {
    const next = transition(
      state({ phase: "solve", pass: 3 }),
      { type: "solution_graded", passed: true, score: 90, errorCodes: [] },
      v2,
    );
    expect(next).toMatchObject({ phase: "mastered", pass: 3 });
  });

  it("solve -> mastered on the final round pass (v1: round 2)", () => {
    const next = transition(
      state({ phase: "solve", pass: 2 }),
      { type: "solution_graded", passed: true, score: 90, errorCodes: [] },
      v1,
    );
    expect(next).toMatchObject({ phase: "mastered", pass: 2 });
  });

  it("solve loops on itself forever on repeated failure (no FSM-driven escape)", () => {
    let cur = state({ phase: "solve", pass: 1, solveRepairs: 0 });
    for (let i = 1; i <= 5; i++) {
      cur = transition(
        cur,
        {
          type: "solution_graded",
          passed: false,
          score: 40,
          errorCodes: ["weak_definition"],
        },
        v2,
      );
      expect(cur).toMatchObject({ phase: "solve", pass: 1, solveRepairs: i });
    }
  });

  it("solve continuation keeps state and counters unchanged", () => {
    const current = state({ phase: "solve", pass: 1, solveRepairs: 1 });
    const next = transition(
      current,
      { type: "phase_continues", reason: "prompted" },
      v2,
    );
    expect(next).toEqual(current);
  });

  it("teach -> connect on the next round on teach_done", () => {
    const next = transition(
      state({ phase: "teach", pass: 1 }),
      { type: "teach_done" },
      v2,
    );
    expect(next).toMatchObject({ phase: "connect", pass: 2, connectGrills: 0 });

    const third = transition(
      state({ phase: "teach", pass: 2 }),
      { type: "teach_done" },
      v2,
    );
    expect(third).toMatchObject({ phase: "connect", pass: 3 });
  });

  it("mastered throws on any further event", () => {
    expect(() =>
      transition(
        state({ phase: "mastered", pass: 3 }),
        { type: "teach_done" },
        v2,
      ),
    ).toThrow();
  });

  it("throws on an illegal event for the current phase", () => {
    expect(() =>
      transition(
        state({ phase: "orient" }),
        { type: "connection_graded", connected: true },
        v2,
      ),
    ).toThrow();
  });
});

describe("isTerminal", () => {
  it("is true only in mastered", () => {
    expect(isTerminal(state({ phase: "mastered" }))).toBe(true);
    expect(isTerminal(state({ phase: "solve" }))).toBe(false);
  });
});

describe("writesGoldilocks", () => {
  const writing = (writeOnPass: 2 | 3) => ({
    goldilocks: {
      scope: { nodeId: "ability-1", bands: null },
      writeOnPass,
      writesRating: true,
    },
  });
  const foundation = {
    goldilocks: {
      scope: { nodeId: "ability-1", bands: null },
      writeOnPass: 3 as const,
      writesRating: false,
    },
  };

  it("is true for a scored solve on the write round", () => {
    expect(
      writesGoldilocks(
        state({ phase: "solve", pass: 3 }),
        { type: "solution_graded", passed: true, score: 90, errorCodes: [] },
        writing(3),
      ),
    ).toBe(true);
  });

  it("is false on earlier rounds", () => {
    expect(
      writesGoldilocks(
        state({ phase: "solve", pass: 1 }),
        { type: "solution_graded", passed: true, score: 90, errorCodes: [] },
        writing(3),
      ),
    ).toBe(false);
  });

  it("is true for a failing solve on the write round", () => {
    expect(
      writesGoldilocks(
        state({ phase: "solve", pass: 2 }),
        {
          type: "solution_graded",
          passed: false,
          score: 40,
          errorCodes: ["weak_definition"],
        },
        writing(2),
      ),
    ).toBe(true);
  });

  it("is always false for a foundation unit (writesRating: false)", () => {
    expect(
      writesGoldilocks(
        state({ phase: "solve", pass: 3 }),
        { type: "solution_graded", passed: true, score: 90, errorCodes: [] },
        foundation,
      ),
    ).toBe(false);
  });
});

describe("shouldTeachMissedConnection", () => {
  it("is false while under the grill limit", () => {
    const s = state({ phase: "connect", connectGrills: 0 });
    expect(
      shouldTeachMissedConnection(
        s,
        { type: "connection_graded", connected: false },
        v2,
      ),
    ).toBe(false);
  });

  it("is true the moment the grill limit is about to be exhausted", () => {
    const s = state({ phase: "connect", connectGrills: 1 });
    expect(
      shouldTeachMissedConnection(
        s,
        { type: "connection_graded", connected: false },
        v2,
      ),
    ).toBe(true);
  });

  it("is false when the connection was actually made", () => {
    const s = state({ phase: "connect", connectGrills: 1 });
    expect(
      shouldTeachMissedConnection(
        s,
        { type: "connection_graded", connected: true },
        v2,
      ),
    ).toBe(false);
  });
});

describe("shouldMicroTeach", () => {
  it("is false while under the repair limit", () => {
    const s = state({ phase: "solve", solveRepairs: 0 });
    expect(
      shouldMicroTeach(
        s,
        {
          type: "solution_graded",
          passed: false,
          score: 40,
          errorCodes: ["weak_definition"],
        },
        v2,
      ),
    ).toBe(false);
  });

  it("is true the moment the repair limit is about to be exhausted", () => {
    const s = state({ phase: "solve", solveRepairs: 1 });
    expect(
      shouldMicroTeach(
        s,
        {
          type: "solution_graded",
          passed: false,
          score: 40,
          errorCodes: ["weak_definition"],
        },
        v2,
      ),
    ).toBe(true);
  });

  it("is false when the solve actually passed", () => {
    const s = state({ phase: "solve", solveRepairs: 1 });
    expect(
      shouldMicroTeach(
        s,
        { type: "solution_graded", passed: true, score: 90, errorCodes: [] },
        v2,
      ),
    ).toBe(false);
  });
});
