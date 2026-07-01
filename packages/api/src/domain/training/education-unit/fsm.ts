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

import type {
  LoopPolicy,
  PassIndex,
  UnitEvent,
  UnitPhase,
  UnitState,
} from "./unit";

export type { UnitEvent } from "./unit";

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
      // Missed it. Grill again — unless we've hit the limit, in which case we
      // give up on Connect and advance anyway so the learner is never trapped.
      // This branch reaches the *same* next state as a clean pass; the only
      // distinguishing signal (grills exhausted) lives in connectGrills right
      // up until enter() resets it below. Callers that need to know "did this
      // learner actually get it, or did we force them through" must check
      // shouldTeachMissedConnection() against the pre-transition state/event,
      // not after the fact — the counter is gone once this returns.
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
      // Wrong or unclear — stay in Solve and try again. The FSM itself never
      // micro-teaches (there is no phase for it); it only tracks the repair
      // count. Whether this particular repair has crossed the micro-teach
      // threshold is answered by shouldMicroTeach(), called by the caller
      // against the pre-transition state/event, same as Connect above.
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
 * Call this BEFORE transition() — connectGrills resets the instant a phase
 * changes, so this is the only moment the "did we have to force this learner
 * through?" signal exists. True means the upcoming Connect failure is the one
 * that exhausts the grill budget, so the next Solve prompt should teach the
 * missed idea before posing the scenario.
 */
export const shouldTeachMissedConnection = (
  state: UnitState,
  event: Extract<UnitEvent, { type: "connection_graded" }>,
  policy: LoopPolicy,
): boolean =>
  state.phase === "connect" &&
  !event.connected &&
  state.connectGrills + 1 >= policy.maxGrillsBeforeTeach;

/**
 * Call this BEFORE transition(), same reason as shouldTeachMissedConnection.
 * True means the upcoming Solve failure crosses maxRepairsBeforeMicroTeach,
 * so the next Solve prompt should micro-teach before the learner retries.
 */
export const shouldMicroTeach = (
  state: UnitState,
  event: Extract<UnitEvent, { type: "solution_graded" }>,
  policy: LoopPolicy,
): boolean =>
  state.phase === "solve" &&
  !event.passed &&
  state.solveRepairs + 1 >= policy.maxRepairsBeforeMicroTeach;

/**
 * The single moment the unit feeds the rating system: a passing Solve on pass 2.
 * Both passes read difficulty when generating their scenario; only this writes.
 */
export const writesGoldilocks = (state: UnitState, event: UnitEvent): boolean =>
  state.phase === "solve" &&
  state.pass === 2 &&
  event.type === "solution_graded" &&
  event.passed;

function expect(ok: boolean, state: UnitState, event: UnitEvent): asserts ok {
  if (!ok) {
    throw new Error(
      `Illegal event "${event.type}" in phase "${state.phase}" (pass ${state.pass}).`,
    );
  }
}
