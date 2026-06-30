// education-unit/unit.ts
//
// What an education unit IS. Edit this file (or register a new recipe) to change
// how a unit runs — pass count, teach beats, loop limits, the pass/fail bar,
// the Goldilocks wiring. The runtime never hard-codes the shape; it reads it
// from a recipe so units stay modular and changeable.
//
// A unit = two passes of connect -> solve, with a teach at each seam:
//
//   [orient teach] -> connect -> solve -> [concept teach] -> connect -> solve -> mastered
//        pass:           1         1                            2         2
//
// Pass 1 READS difficulty from Goldilocks. Pass 2 READS and WRITES it.

import type { RatingScope } from "../orchestration/rating-scope";

/**
 * The coarse state a unit sits in. Stored on the run row (reusing `UnitRun`).
 * The fine "awaiting answer vs. evaluating answer" sub-state is implicit: it is
 * whichever side of a pending learner submission we are on, so it is never
 * persisted as its own state.
 */
export type UnitPhase =
  | "orient" // teach: activate prior knowledge + set stakes — NEVER reveal the mechanism
  | "connect" // pose scenario / grill until the learner reconstructs the core idea
  | "solve" // frame the solution, repair until it is correct and clear
  | "teach" // concept teach, post-struggle, between the two passes
  | "mastered"; // terminal

/** A unit runs the connect->solve loop twice. Pass 2 is harder and writes Goldilocks. */
export type PassIndex = 1 | 2;

/**
 * The durable cursor for one unit run. This is the typed view of the `UnitRun`
 * row — the single source of truth for "where are we." Only the reducer writes it.
 */
export type UnitState = {
  unitId: string;
  recipeVersion: string; // pins the recipe this run started on
  phase: UnitPhase;
  pass: PassIndex;
  connectGrills: number; // failed connect attempts in the current pass; reset on phase change
  solveRepairs: number; // failed solve attempts in the current pass; reset on phase change
};

/**
 * Loop limits — without these, a stuck learner loops forever. Tunable per unit
 * because they live in the recipe, not the engine.
 */
export type LoopPolicy = {
  maxGrillsBeforeTeach: number; // connect: after N failed grills, teach the missing idea, then advance
  maxRepairsBeforeMicroTeach: number; // solve: after N failed repairs, micro-teach, then retry
};

/** The pass/fail bar for a solve. `evaluationGrade` is 0–100; clearing `passAt` passes. */
export type GradeThreshold = {
  passAt: number; // e.g. 80
};

/**
 * Where this unit reads and writes difficulty. Goldilocks is external and is NOT
 * modified here — we only hold the ports into it.
 */
export type GoldilocksWiring = {
  scope: RatingScope; // resolved cluster node + difficulty bands
  writeOnPass: PassIndex; // 2 — only the second pass updates the rating
};

/**
 * The whole recipe: the data that defines a unit. Versioned, so an in-flight unit
 * finishes on the recipe it started with even after the recipe changes.
 */
export type UnitRecipe = {
  version: string; // e.g. "education-unit-v1"
  passes: 2; // explicit and changeable; fixed at 2 for now
  teachBeats: { orient: true; concept: true };
  policy: LoopPolicy;
  grade: GradeThreshold;
  goldilocks: GoldilocksWiring;
};

/**
 * Takes a recipe version id; produces its frozen recipe; fails only when the
 * version is unknown (an in-flight run referenced a recipe we no longer ship).
 */
export declare function getUnitRecipe(version: string): UnitRecipe;
