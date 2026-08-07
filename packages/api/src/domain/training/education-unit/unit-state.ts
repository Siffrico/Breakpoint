import { Data, Effect } from "effect";

import type {
  EducationExperienceSnapshot,
  UnitCompleteTodo,
  UnitDifficultySnapshot,
  UnitMasteryContract,
  UnitReviewChallenge,
  UnitReviewPass,
  UnitRunKind,
  UnitRunMode,
  UnitSolveTodo,
  UnitTodo,
  UnitTodoResult,
} from "@acme/validators";
import { UnitMasteryContractSchema } from "@acme/validators";

import type { EducationExperienceDefinition } from "./experience";
import { snapshotEducationExperience } from "./experience";

/**
 * One run teaches one capability. `todos` is the whole state: the teaching
 * moves, then the solve the learner answers, then the complete the reviewer
 * marks. `mode`, `reviewPass` and `activeReviewChallenge` are projections of
 * that list, recomputed on every read — never branched on to decide what
 * happens next.
 */
export interface PersistedUnitRun {
  readonly unitId: string;
  readonly sessionId: string;
  readonly userId: string | null;
  readonly kind: UnitRunKind;
  readonly experience: EducationExperienceSnapshot;
  readonly masteryContract: UnitMasteryContract;
  readonly todos: readonly UnitTodo[];
  readonly reviewerFeedback: string | null;
  readonly difficultySnapshot: UnitDifficultySnapshot | null;
  /** Projection of `todos`. */
  readonly mode: UnitRunMode;
  /** Projection of `todos`. */
  readonly reviewPass: UnitReviewPass;
  /** Projection of `todos`. */
  readonly activeReviewChallenge: UnitReviewChallenge | null;
}

export class UnitStateContractError extends Data.TaggedError(
  "UnitStateContractError",
)<{ readonly message: string }> {}

const contractFailure = (message: string) =>
  Effect.fail(new UnitStateContractError({ message }));

/**
 * An education run's first pass is a warm-up: its mark cannot end the unit, so
 * a Pass 1 fail and a Pass 1 succeed both open Pass 2. A recall run is a single
 * checkpoint that closes either way. This is the only place a pass number is
 * compared to anything.
 */
const endsOnFor = (
  kind: UnitRunKind,
  pass: UnitReviewPass,
): UnitCompleteTodo["endsOn"] => {
  if (kind === "recall") return "any";
  return pass > 1 ? "pass" : "never";
};

export const passTodos = (
  kind: UnitRunKind,
  pass: UnitReviewPass,
): UnitTodo[] => [
  { kind: "solve", status: "pending", pass, challenge: null },
  {
    kind: "complete",
    status: "pending",
    pass,
    endsOn: endsOnFor(kind, pass),
    result: null,
  },
];

/**
 * The single teaching step an education run opens with. One worked example, not
 * one lecture per dimension: the mastery dimensions say what the reviewer will
 * grade, and were never a lesson sequence. Kept in the `capability` todo's id
 * slot so runs created under the per-dimension shape still load and finish.
 */
export const TEACH_TODO_ID = "teach";

export const currentTodo = (
  run: Pick<PersistedUnitRun, "todos">,
): UnitTodo | null =>
  run.todos.find((todo) => todo.status !== "completed") ?? null;

const currentSolve = (todos: readonly UnitTodo[]): UnitSolveTodo | null => {
  const todo = todos.find((candidate) => candidate.status !== "completed");
  return todo?.kind === "solve" ? todo : null;
};

/**
 * The next unanswered solve, whether or not it heads the list. Only the prefill
 * slot looks past the head — presenting and answering stay head-bound.
 */
const nextSolve = (todos: readonly UnitTodo[]): UnitSolveTodo | null => {
  const todo = todos.find(
    (candidate) =>
      candidate.kind === "solve" && candidate.status !== "completed",
  );
  return todo?.kind === "solve" ? todo : null;
};

const currentComplete = (
  todos: readonly UnitTodo[],
): UnitCompleteTodo | null => {
  const todo = todos.find((candidate) => candidate.status !== "completed");
  return todo?.kind === "complete" ? todo : null;
};

/** Whether the mark now pending can end the unit. */
export const isDecisivePass = (
  run: Pick<PersistedUnitRun, "todos">,
): boolean => {
  const pending = run.todos.find((todo) => todo.status !== "completed");
  if (!pending || pending.kind === "capability") return false;
  const complete = run.todos.find(
    (todo) => todo.kind === "complete" && todo.pass === pending.pass,
  );
  return complete?.kind === "complete" ? complete.endsOn !== "never" : false;
};

const currentPass = (todos: readonly UnitTodo[]): UnitReviewPass => {
  const pending = todos.find((todo) => todo.status !== "completed");
  if (pending && pending.kind !== "capability") return pending.pass;
  const passes = todos.flatMap((todo) =>
    todo.kind === "capability" ? [] : [todo.pass],
  );
  return passes.at(-1) ?? 1;
};

/**
 * The legacy four-state enum, recomputed from the list. `awaiting_next_pass` is
 * a later pass's solve waiting on Enter; Pass 1's opening scenario follows the
 * mentor in the same turn, so it never parks.
 */
const deriveMode = (todos: readonly UnitTodo[]): UnitRunMode => {
  const pending = todos.find((todo) => todo.status !== "completed");
  if (!pending) return "complete";
  if (pending.kind === "capability") return "learning";
  if (pending.kind === "solve" && pending.status === "pending") {
    return pending.pass > 1 ? "awaiting_next_pass" : "review";
  }
  return "review";
};

/** Rebuilds every projection from the list. The single place they are set. */
const project = (
  run: Omit<
    PersistedUnitRun,
    "mode" | "reviewPass" | "activeReviewChallenge"
  > & {
    readonly todos: readonly UnitTodo[];
  },
): PersistedUnitRun => {
  const solve = currentSolve(run.todos);
  return {
    ...run,
    mode: deriveMode(run.todos),
    reviewPass: currentPass(run.todos),
    activeReviewChallenge:
      solve?.status === "presented" ? solve.challenge : null,
  };
};

export const projectUnitRun = project;

export const createUnitRun = ({
  unitId,
  sessionId,
  userId,
  kind,
  masteryContract,
  experience,
}: {
  unitId: string;
  sessionId: string;
  userId?: string | null;
  kind: UnitRunKind;
  masteryContract: UnitMasteryContract;
  experience: EducationExperienceDefinition;
}): PersistedUnitRun => {
  const contract = UnitMasteryContractSchema.parse(masteryContract);
  return project({
    unitId,
    sessionId,
    userId: userId ?? null,
    kind,
    experience: snapshotEducationExperience(experience),
    masteryContract: contract,
    todos: [
      {
        kind: "capability",
        // A recall run re-tests a capability that was already taught.
        status: kind === "recall" ? "completed" : "pending",
        dimensionId: TEACH_TODO_ID,
      },
      ...passTodos(kind, 1),
    ],
    reviewerFeedback: null,
    difficultySnapshot: null,
  });
};

const replaceTodo = (
  todos: readonly UnitTodo[],
  target: UnitTodo,
  next: UnitTodo,
): UnitTodo[] => todos.map((todo) => (todo === target ? next : todo));

export const completeCurrentCapabilityTodo = (
  run: PersistedUnitRun,
  todoId: string,
): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  const current = currentTodo(run);
  if (current?.kind !== "capability") {
    return contractFailure("This unit has no teaching move left to check off.");
  }
  if (current.dimensionId !== todoId) {
    return contractFailure(
      `The mentor may only complete the current teaching move (${current.dimensionId}).`,
    );
  }
  return Effect.succeed(
    project({
      ...run,
      todos: replaceTodo(run.todos, current, {
        ...current,
        status: "completed",
      }),
    }),
  );
};

/**
 * Parks a challenge on the next unanswered solve, which is usually still behind
 * the head — that is the whole point of a prefill. Pre-generation and live
 * presentation write through the same slot, so a background task that lands
 * after the solve opened is a no-op rather than a challenge swap.
 */
export const attachChallenge = ({
  run,
  challenge,
}: {
  run: PersistedUnitRun;
  challenge: UnitReviewChallenge;
}): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  const solve = nextSolve(run.todos);
  if (solve?.status !== "pending") {
    return contractFailure("There is no unopened challenge to fill.");
  }
  return Effect.succeed(
    project({
      ...run,
      todos: replaceTodo(run.todos, solve, { ...solve, challenge }),
    }),
  );
};

/** Puts the pending solve on the learner's screen. */
export const presentSolve = ({
  run,
  challenge,
}: {
  run: PersistedUnitRun;
  challenge: UnitReviewChallenge;
}): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  const solve = currentSolve(run.todos);
  if (solve?.status !== "pending") {
    return contractFailure("There is no challenge waiting to be presented.");
  }
  return Effect.succeed(
    project({
      ...run,
      todos: replaceTodo(run.todos, solve, {
        ...solve,
        status: "presented",
        challenge,
      }),
    }),
  );
};

/** The learner answered. Checked off by the server, not by a model. */
export const closeSolve = (
  run: PersistedUnitRun,
): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  const solve = currentSolve(run.todos);
  if (solve?.status !== "presented") {
    return contractFailure("There is no open challenge to answer.");
  }
  return Effect.succeed(
    project({
      ...run,
      todos: replaceTodo(run.todos, solve, { ...solve, status: "completed" }),
    }),
  );
};

/**
 * The reviewer's mark, and the only thing that ends a unit. A decisive pass
 * finishes the list; anything else appends the next pass. No pass number is
 * consulted — `decisive` was fixed when the todo was created.
 */
export const markComplete = ({
  run,
  result,
  feedback,
}: {
  run: PersistedUnitRun;
  result: UnitTodoResult;
  feedback: string;
}): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  const complete = currentComplete(run.todos);
  if (!complete) {
    return contractFailure("There is no answered challenge to mark.");
  }
  if (feedback.trim().length < 12) {
    return contractFailure(
      "A review mark requires substantive learner-facing feedback.",
    );
  }
  const marked = replaceTodo(run.todos, complete, {
    ...complete,
    status: "completed",
    result,
  });
  const unitEnds =
    complete.endsOn === "any" ||
    (complete.endsOn === "pass" && result === "pass");
  return Effect.succeed(
    project({
      ...run,
      reviewerFeedback: feedback.trim(),
      todos: unitEnds
        ? marked
        : [...marked, ...passTodos(run.kind, complete.pass + 1)],
    }),
  );
};
