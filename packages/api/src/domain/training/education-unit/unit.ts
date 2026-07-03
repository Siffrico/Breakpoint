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

import type { UnitDifficultySnapshot, UnitScenarioSpec } from "@acme/validators";
import type { RatingScope } from "../orchestration/rating-scope";

// The calibrated-difficulty snapshot persisted on a unit run. Canonical
// definition lives in `@acme/validators` (shared with the DB `.$type<>()`
// column) so the API and database contracts cannot drift.
export type { UnitDifficultySnapshot };

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

/** Both passes share one calibrated difficulty; pass 2 supplies rating evidence. */
export type PassIndex = 1 | 2;

/**
 * The things that can happen in a state. Lives here (not in fsm.ts) so that
 * AI-SDK tool definitions and phase-agent files can reference the event shape
 * — e.g. to type a tool's output — without importing the reducer itself.
 * fsm.ts imports this and owns the only code that actually applies one.
 */
export type UnitEvent =
  | { type: "teach_done" } // an Orient or Concept teach finished
  | {
      type: "phase_continues";
      reason: "prompted" | "needs_more_work";
    } // Connect/Solve produced a learner prompt without grading an attempt
  | { type: "connection_graded"; connected: boolean } // result of a Connect check
  | { type: "solution_graded"; passed: boolean }; // result of a Solve check (grade >= threshold)

/**
 * The durable cursor for one unit run. This is the typed view of the `UnitRun`
 * row — the single source of truth for "where are we." Only the reducer writes it.
 */
export interface UnitState {
  unitId: string;
  recipeVersion: string; // pins the recipe this run started on
  phase: UnitPhase;
  pass: PassIndex;
  connectGrills: number; // failed connect attempts in the current pass; reset on phase change
  solveRepairs: number; // failed solve attempts in the current pass; reset on phase change
}

/**
 * The durable unit-run row: the FSM cursor (`UnitState`) plus the identity it
 * belongs to. `UnitState.unitId` holds the unit content id; the session and
 * user are persistence concerns the pure FSM never touches. This is what the
 * run repository reads and writes, and what a resolved workspace turn carries.
 */
export type PersistedUnitRun = UnitState & {
  sessionId: string;
  userId: string | null;
  /** Set once by the first committed turn and reused for both passes. */
  difficultySnapshot: UnitDifficultySnapshot | null;
  /**
   * The active ScenarioSpec. Replaceable — pass 1's spec is stored, then pass 2
   * overwrites it after reading pass 1's as its "new surface" constraint.
   */
  scenarioSpec: UnitScenarioSpec | null;
};

/**
 * Loop limits — without these, a stuck learner loops forever. Tunable per unit
 * because they live in the recipe, not the engine.
 */
export interface LoopPolicy {
  maxGrillsBeforeTeach: number; // connect: after N failed grills, teach the missing idea, then advance
  maxRepairsBeforeMicroTeach: number; // solve: after N failed repairs, micro-teach, then retry
}

/** The pass/fail bar for a solve. `evaluationGrade` is 0–100; clearing `passAt` passes. */
export interface GradeThreshold {
  passAt: number; // e.g. 80
  /**
   * Time budget for the pass-2 transfer solve, measured from the persisted
   * solvePresentedAt stamp. Exceeding it marks the attempt wasOverTime, which
   * Goldilocks discounts (see engine/rating/evidence.ts overTimeDiscount).
   */
  solveTimeLimitSeconds: number;
}

/**
 * Where this unit reads and writes difficulty. Goldilocks is external and is NOT
 * modified here — we only hold the ports into it.
 */
export interface GoldilocksWiring {
  scope: RatingScope; // resolved cluster node + difficulty bands
  writeOnPass: PassIndex; // 2 — only the second pass updates the rating
}

/**
 * The whole recipe: the data that defines a unit. Versioned, so an in-flight unit
 * finishes on the recipe it started with even after the recipe changes.
 */
export interface UnitRecipe {
  version: string; // e.g. "education-unit-v1"
  passes: 2; // explicit and changeable; fixed at 2 for now
  teachBeats: { orient: true; concept: true };
  policy: LoopPolicy;
  grade: GradeThreshold;
  goldilocks: GoldilocksWiring;
}

const RECIPE_VERSIONS = ["education-unit-v1"] as const;
type RecipeVersion = (typeof RECIPE_VERSIONS)[number];

/** The recipe version every new unit run starts on. */
export const CURRENT_RECIPE_VERSION: RecipeVersion = "education-unit-v1";

const isRecipeVersion = (version: string): version is RecipeVersion =>
  (RECIPE_VERSIONS as readonly string[]).includes(version);

/**
 * Takes a recipe version id and the caller's already-resolved Goldilocks
 * scope (see resolveRatingScope in ../orchestration/rating-scope); produces
 * the frozen recipe for that version; fails only when the version is unknown
 * (an in-flight run referenced a recipe we no longer ship). The scope is a
 * parameter, not something this function resolves itself — it depends on the
 * live curriculum plan, which is runtime data this pure lookup doesn't have.
 */
export function getUnitRecipe(version: string, scope: RatingScope): UnitRecipe {
  if (!isRecipeVersion(version)) {
    throw new Error(`Unknown education-unit recipe version: "${version}"`);
  }
  return {
    version,
    passes: 2,
    teachBeats: { orient: true, concept: true },
    policy: {
      maxGrillsBeforeTeach: 2,
      maxRepairsBeforeMicroTeach: 2,
    },
    grade: {
      passAt: 80,
      solveTimeLimitSeconds: 300,
    },
    goldilocks: {
      scope,
      writeOnPass: 2,
    },
  };
}
