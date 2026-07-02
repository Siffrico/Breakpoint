import { describe, expect, it } from "vitest";

import type { LoopPolicy, UnitState } from "./unit";
import {
  initialState,
  isTerminal,
  shouldMicroTeach,
  shouldTeachMissedConnection,
  transition,
  writesGoldilocks,
} from "./fsm";

const policy: LoopPolicy = {
  maxGrillsBeforeTeach: 2,
  maxRepairsBeforeMicroTeach: 2,
};

const state = (overrides: Partial<UnitState> = {}): UnitState => ({
  ...initialState("unit-1", "education-unit-v1"),
  ...overrides,
});

describe("transition", () => {
  it("orient -> connect (pass 1) on teach_done", () => {
    const next = transition(
      state({ phase: "orient" }),
      { type: "teach_done" },
      policy,
    );
    expect(next).toMatchObject({ phase: "connect", pass: 1, connectGrills: 0 });
  });

  it("connect -> solve when connected", () => {
    const next = transition(
      state({ phase: "connect", pass: 1, connectGrills: 1 }),
      { type: "connection_graded", connected: true },
      policy,
    );
    expect(next).toMatchObject({ phase: "solve", pass: 1, connectGrills: 0 });
  });

  it("connect loops on itself while under the grill limit", () => {
    const next = transition(
      state({ phase: "connect", pass: 1, connectGrills: 0 }),
      { type: "connection_graded", connected: false },
      policy,
    );
    expect(next).toMatchObject({ phase: "connect", pass: 1, connectGrills: 1 });
  });

  it("connect continuation keeps state and counters unchanged", () => {
    const current = state({ phase: "connect", pass: 1, connectGrills: 1 });
    const next = transition(
      current,
      { type: "phase_continues", reason: "needs_more_work" },
      policy,
    );
    expect(next).toEqual(current);
  });

  it("connect force-advances to solve once the grill limit is hit", () => {
    const next = transition(
      state({ phase: "connect", pass: 1, connectGrills: 1 }),
      { type: "connection_graded", connected: false },
      policy,
    );
    expect(next).toMatchObject({ phase: "solve", pass: 1, connectGrills: 0 });
  });

  it("solve -> teach on a pass-1 pass", () => {
    const next = transition(
      state({ phase: "solve", pass: 1 }),
      { type: "solution_graded", passed: true },
      policy,
    );
    expect(next).toMatchObject({ phase: "teach", pass: 1 });
  });

  it("solve -> mastered on a pass-2 pass", () => {
    const next = transition(
      state({ phase: "solve", pass: 2 }),
      { type: "solution_graded", passed: true },
      policy,
    );
    expect(next).toMatchObject({ phase: "mastered", pass: 2 });
  });

  it("solve loops on itself forever on repeated failure (no FSM-driven escape)", () => {
    let cur = state({ phase: "solve", pass: 1, solveRepairs: 0 });
    for (let i = 1; i <= 5; i++) {
      cur = transition(cur, { type: "solution_graded", passed: false }, policy);
      expect(cur).toMatchObject({ phase: "solve", pass: 1, solveRepairs: i });
    }
  });

  it("solve continuation keeps state and counters unchanged", () => {
    const current = state({ phase: "solve", pass: 1, solveRepairs: 1 });
    const next = transition(
      current,
      { type: "phase_continues", reason: "prompted" },
      policy,
    );
    expect(next).toEqual(current);
  });

  it("teach -> connect (pass 2) on teach_done", () => {
    const next = transition(
      state({ phase: "teach", pass: 1 }),
      { type: "teach_done" },
      policy,
    );
    expect(next).toMatchObject({ phase: "connect", pass: 2, connectGrills: 0 });
  });

  it("mastered throws on any further event", () => {
    expect(() =>
      transition(
        state({ phase: "mastered", pass: 2 }),
        { type: "teach_done" },
        policy,
      ),
    ).toThrow();
  });

  it("throws on an illegal event for the current phase", () => {
    expect(() =>
      transition(
        state({ phase: "orient" }),
        { type: "connection_graded", connected: true },
        policy,
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
  it("is true only for a passing pass-2 solve", () => {
    expect(
      writesGoldilocks(state({ phase: "solve", pass: 2 }), {
        type: "solution_graded",
        passed: true,
      }),
    ).toBe(true);
  });

  it("is false for a passing pass-1 solve", () => {
    expect(
      writesGoldilocks(state({ phase: "solve", pass: 1 }), {
        type: "solution_graded",
        passed: true,
      }),
    ).toBe(false);
  });

  it("is false for a failing pass-2 solve", () => {
    expect(
      writesGoldilocks(state({ phase: "solve", pass: 2 }), {
        type: "solution_graded",
        passed: false,
      }),
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
        policy,
      ),
    ).toBe(false);
  });

  it("is true the moment the grill limit is about to be exhausted", () => {
    const s = state({ phase: "connect", connectGrills: 1 });
    expect(
      shouldTeachMissedConnection(
        s,
        { type: "connection_graded", connected: false },
        policy,
      ),
    ).toBe(true);
  });

  it("is false when the connection was actually made", () => {
    const s = state({ phase: "connect", connectGrills: 1 });
    expect(
      shouldTeachMissedConnection(
        s,
        { type: "connection_graded", connected: true },
        policy,
      ),
    ).toBe(false);
  });
});

describe("shouldMicroTeach", () => {
  it("is false while under the repair limit", () => {
    const s = state({ phase: "solve", solveRepairs: 0 });
    expect(
      shouldMicroTeach(s, { type: "solution_graded", passed: false }, policy),
    ).toBe(false);
  });

  it("is true the moment the repair limit is about to be exhausted", () => {
    const s = state({ phase: "solve", solveRepairs: 1 });
    expect(
      shouldMicroTeach(s, { type: "solution_graded", passed: false }, policy),
    ).toBe(true);
  });

  it("is false when the solve actually passed", () => {
    const s = state({ phase: "solve", solveRepairs: 1 });
    expect(
      shouldMicroTeach(s, { type: "solution_graded", passed: true }, policy),
    ).toBe(false);
  });
});
