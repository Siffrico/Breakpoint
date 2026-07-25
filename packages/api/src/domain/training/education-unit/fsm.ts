// education-unit/fsm.ts
//
// The unit state machine — just the states and the moves between them.
// Nothing here talks to the AI, the database, or Goldilocks. It only answers
// one question: "given where we are and what just happened, where do we go next?"
//
//   Orient ─▶ Connect ─▶ Solve ─▶ Teach ─▶ Connect ─▶ Solve ─▶ Teach ─▶ Connect ─▶ Solve ─▶ Mastered
//              round 1    round 1            round 2    round 2           round 3    round 3
//
//   Connect loops on itself while the learner misses the core connection —
//   in v2 it never force-advances; help escalates instead.
//   Solve loops on itself while the solution is wrong or unclear.
//   Every round READS difficulty; only the recipe's writeOnPass round WRITES it,
//   and only when the recipe's wiring says this unit writes at all.

import type {
  PassIndex,
  UnitEvent,
  UnitPhase,
  UnitRecipe,
  UnitState,
} from "./unit";

export type { UnitEvent } from "./unit";

/** The subset of the recipe the reducer needs. */
export type TransitionRecipe = Pick<UnitRecipe, "passes" | "policy">;

/** Where every unit begins. */
export const initialState = (
  unitId: string,
  recipeVersion: string,
): UnitState => ({
  unitId,
  recipeVersion,
  phase: "orient",
  pass: 1,
  connectGrills: 0,
  solveRepairs: 0,
});

/**
 * Where a recall run begins: directly at the scored transfer moment. The
 * existing solve-phase transitions do the rest — prompted presents the
 * composed scenario, a passing verdict masters, a failing one repairs.
 */
export const recallInitialState = (
  unitId: string,
  recipeVersion: string,
): UnitState => ({
  unitId,
  recipeVersion,
  phase: "solve",
  pass: 2,
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
  connectTeachDue: false,
});

const nextPass = (pass: PassIndex): PassIndex =>
  Math.min(pass + 1, 3) as PassIndex;

/**
 * Takes the current state, the event that just happened, and the unit's
 * recipe shape (round count + loop policy); produces the next state. Pure —
 * fails only on an event that cannot happen in the current phase (a
 * programming error, never a learner action).
 */
export const transition = (
  state: UnitState,
  event: UnitEvent,
  recipe: TransitionRecipe,
): UnitState => {
  switch (state.phase) {
    case "orient":
      // The opening teach is done — start round 1.
      expect(event.type === "teach_done", state, event);
      return enter(state, "connect", 1);

    case "connect": {
      expect(
        event.type === "phase_continues" || event.type === "connection_graded",
        state,
        event,
      );
      // If a teach was due, the turn that produced this event delivered it
      // (teach + re-pose). Consume the one-shot and restart the grill budget
      // so remediation is never repeated on the learner's very next answer.
      const current = state.connectTeachDue
        ? { ...state, connectTeachDue: false, connectGrills: 0 }
        : state;
      if (event.type === "phase_continues") return current;
      if (event.connected) {
        return enter(current, "solve", current.pass); // got the core — go solve
      }
      const grills = current.connectGrills + 1;
      return {
        ...current,
        connectGrills: grills,
        connectTeachDue: grills >= recipe.policy.maxGrillsBeforeTeach,
      };
    }

    case "solve": {
      expect(
        event.type === "phase_continues" || event.type === "solution_graded",
        state,
        event,
      );
      if (event.type === "phase_continues") return state;
      if (event.passed) {
        // Correct and clear. Non-final rounds hand off to the seam teach
        // (feedback + worked example + scenario evolution); the final round
        // finishes the unit.
        return state.pass < recipe.passes
          ? enter(state, "teach", state.pass)
          : enter(state, "mastered", state.pass);
      }
      // Wrong or unclear — stay in Solve and try again. The FSM itself never
      // micro-teaches (there is no phase for it); it only tracks the repair
      // count. Whether this particular repair has crossed the micro-teach
      // threshold is answered by shouldMicroTeach(), called by the caller
      // against the pre-transition state/event, same as Connect above.
      return { ...state, solveRepairs: state.solveRepairs + 1 };
    }

    case "teach":
      // The seam teach is done — the evolved scenario starts the next round at
      // the same frozen Goldilocks difficulty.
      expect(event.type === "teach_done", state, event);
      return enter(state, "connect", nextPass(state.pass));

    case "mastered":
      throw new Error("Unit is already mastered; no further transitions.");
  }
};

/** True once the unit is finished. */
export const isTerminal = (state: UnitState): boolean =>
  state.phase === "mastered";

/**
 * Call this BEFORE transition() — it reads the pre-transition grill counter.
 * True means the upcoming Connect failure crosses the grill budget, so the
 * next prompt must teach the missed idea before re-posing the same connect.
 */
export const shouldTeachMissedConnection = (
  state: UnitState,
  event: Extract<UnitEvent, { type: "connection_graded" }>,
  recipe: TransitionRecipe,
): boolean =>
  state.phase === "connect" &&
  !event.connected &&
  state.connectGrills + 1 >= recipe.policy.maxGrillsBeforeTeach;

/**
 * Call this BEFORE transition(), same reason as shouldTeachMissedConnection.
 * True means the upcoming Solve failure crosses maxRepairsBeforeMicroTeach,
 * so the next Solve prompt should micro-teach before the learner retries.
 */
export const shouldMicroTeach = (
  state: UnitState,
  event: Extract<UnitEvent, { type: "solution_graded" }>,
  recipe: TransitionRecipe,
): boolean =>
  state.phase === "solve" &&
  !event.passed &&
  state.solveRepairs + 1 >= recipe.policy.maxRepairsBeforeMicroTeach;

/**
 * A scored Solve on the recipe's write round is eligible to feed the rating
 * system — and only when the unit's wiring writes at all (skillset units do;
 * foundation units are criterion-referenced and never touch the ability ELO).
 * Persistence owns the exactly-once guard so later pedagogical repairs cannot
 * write again.
 */
export const writesGoldilocks = (
  state: UnitState,
  event: UnitEvent,
  recipe: Pick<UnitRecipe, "goldilocks">,
): boolean =>
  recipe.goldilocks.writesRating &&
  state.phase === "solve" &&
  state.pass === recipe.goldilocks.writeOnPass &&
  event.type === "solution_graded";

function expect(ok: boolean, state: UnitState, event: UnitEvent): asserts ok {
  if (!ok) {
    throw new Error(
      `Illegal event "${event.type}" in phase "${state.phase}" (pass ${state.pass}).`,
    );
  }
}
