// education-unit/fsm.ts
//
// The unit state machine — just the states and the moves between them.
// Nothing here talks to the AI, the database, or Goldilocks. It only answers
// one question: "given where we are and what just happened, where do we go next?"
//
//   Orient ─▶ Connect ─▶ Solve ─▶ Concept teach ─▶ Connect ─▶ Solve ─▶ Mastered
//              pass 1     pass 1                     pass 2     pass 2
//
//   Connect loops on itself while the learner misses the core connection.
//   Solve loops on itself while the solution is wrong or unclear.
//   Both passes READ difficulty; only pass 2's passing Solve WRITES it.

import type { LoopPolicy, PassIndex, UnitPhase, UnitState } from "./unit";

/** The things that can happen in a state. The machine reacts only to these. */
export type UnitEvent =
  | { type: "teach_done" } // an Orient or Concept teach finished
  | { type: "connection_graded"; connected: boolean } // result of a Connect check
  | { type: "solution_graded"; passed: boolean }; // result of a Solve check (grade >= threshold)

/** Where every unit begins. */
export const initialState = (unitId: string, recipeVersion: string): UnitState => ({
  unitId,
  recipeVersion,
  phase: "orient",
  pass: 1,
  connectGrills: 0,
  solveRepairs: 0,
});

const enter = (
  state: UnitState,
  phase: UnitPhase,
  pass: PassIndex,
): UnitState => ({
  ...state,
  phase,
  pass,
  connectGrills: 0, // counters reset whenever we move to a new phase
  solveRepairs: 0,
});

/**
 * Takes the current state, the event that just happened, and the unit's loop
 * limits; produces the next state. Pure — fails only on an event that cannot
 * happen in the current phase (a programming error, never a learner action).
 */
export const transition = (
  state: UnitState,
  event: UnitEvent,
  policy: LoopPolicy,
): UnitState => {
  switch (state.phase) {
    case "orient":
      // The opening teach is done — start pass 1.
      expect(event.type === "teach_done", state, event);
      return enter(state, "connect", 1);

    case "connect": {
      expect(event.type === "connection_graded", state, event);
      if (event.connected) {
        return enter(state, "solve", state.pass); // got the core — go solve
      }
      const grills = state.connectGrills + 1;
      // Missed it. Grill again — unless we've hit the limit, then teach the idea
      // and move on so the learner is never trapped in Connect.
      return grills >= policy.maxGrillsBeforeTeach
        ? enter(state, "solve", state.pass)
        : { ...state, connectGrills: grills };
    }

    case "solve": {
      expect(event.type === "solution_graded", state, event);
      if (event.passed) {
        // Correct and clear. Pass 1 hands off to the concept teach; pass 2 finishes.
        return state.pass === 1
          ? enter(state, "teach", 1)
          : enter(state, "mastered", 2);
      }
      // Wrong or unclear — stay in Solve and try again (the response repairs or,
      // past the limit, micro-teaches; either way the learner re-solves).
      return { ...state, solveRepairs: state.solveRepairs + 1 };
    }

    case "teach":
      // The middle concept teach is done — start pass 2 (the harder one).
      expect(event.type === "teach_done", state, event);
      return enter(state, "connect", 2);

    case "mastered":
      throw new Error("Unit is already mastered; no further transitions.");
  }
};

/** True once the unit is finished. */
export const isTerminal = (state: UnitState): boolean =>
  state.phase === "mastered";

/**
 * The single moment the unit feeds the rating system: a passing Solve on pass 2.
 * Both passes read difficulty when generating their scenario; only this writes.
 */
export const writesGoldilocks = (state: UnitState, event: UnitEvent): boolean =>
  state.phase === "solve" &&
  state.pass === 2 &&
  event.type === "solution_graded" &&
  event.passed;

const expect = (ok: boolean, state: UnitState, event: UnitEvent): void => {
  if (!ok) {
    throw new Error(
      `Illegal event "${event.type}" in phase "${state.phase}" (pass ${state.pass}).`,
    );
  }
};
