import { Duration, Effect, Schedule } from "effect";

import type { CurriculumNode, UnitContent } from "../types/training.types";
import type {
  PriorLearningRecord,
  UnitBuilderContext,
} from "../unit-builder/contracts";
import type { UnitPreparationError } from "./errors";
import { regimeForNodeKind } from "../engine/progression-model";
import { runSeedStage } from "../unit-builder/seed-stage";
import {
  classifyUnitScaffoldFailure,
  isRetryable,
  UnitContextMissingError,
  UnitPersistError,
  UnitScaffoldError,
} from "./errors";

interface PlanNodeContext {
  readonly id: string;
  readonly parentNodeId: string | null;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly whyItMatters: string;
  readonly orderIndex: number;
  readonly status: string;
  readonly skillMap?: unknown;
}

export interface UnitPreparationDependencies {
  readonly getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  readonly getPlanNodesBySession: (
    sessionId: string,
  ) => Promise<PlanNodeContext[] | null>;
  readonly getTargetIdentity: (sessionId: string) => Promise<string | null>;
  readonly listAttemptHistory: (
    sessionId: string,
  ) => Promise<PriorLearningRecord[]>;
  readonly getUnitKnowledgeContext: (unitNodeId: string) => Promise<{
    workflow: { name: string; steps: string[] };
    framing: { question: string; part: number } | null;
    checked: { label: string; content: string }[];
    targets: {
      id: string;
      kind: "concept" | "mechanism";
      label: string;
      content: string;
    }[];
  } | null>;
  readonly createUnitContentIfAbsent: (input: {
    nodeId: string;
    title: string;
    seedPrompt: string;
    seedHint: string;
    clusterArcFrame: string;
    complexityBudget: UnitContent["complexityBudget"];
    teachbackSetup: UnitContent["teachbackSetup"];
    scenario: UnitContent["scenario"];
    unitMasteryContract: NonNullable<UnitContent["unitMasteryContract"]>;
  }) => Promise<UnitContent | null>;
  readonly replaceUnitContent: (input: {
    nodeId: string;
    title: string;
    seedPrompt: string;
    seedHint: string;
    clusterArcFrame: string;
    complexityBudget: UnitContent["complexityBudget"];
    teachbackSetup: UnitContent["teachbackSetup"];
    scenario: UnitContent["scenario"];
    unitMasteryContract: NonNullable<UnitContent["unitMasteryContract"]>;
  }) => Promise<UnitContent | null>;
  readonly saveNodeBriefing: (input: {
    nodeId: string;
    briefing: NonNullable<UnitContent["clusterBriefing"]>;
  }) => Promise<UnitContent["clusterBriefing"]>;
  /**
   * Holds this node's build lock while `run` executes. Concurrent prepares
   * for the same node must serialize here (the loser re-checks and skips),
   * and readiness waiters observe the same lock until the holder commits.
   * `run` receives deps bound to the lock's own connection; the build must
   * use those so it never waits on a second connection from the pool.
   */
  readonly withUnitBuildLock: <T>(
    nodeId: string,
    run: (lockedDeps: UnitPreparationDependencies) => Promise<T>,
  ) => Promise<T>;
}

export interface PrepareUnitContentInput {
  readonly node: Pick<CurriculumNode, "id">;
  readonly sessionId: string;
  readonly deps: UnitPreparationDependencies;
  readonly forceRefresh?: boolean;
  /** Optional non-critical briefing work that must share the node build lock. */
  readonly prepareClusterBriefing?: () => Promise<{
    nodeId: string;
    briefing: NonNullable<UnitContent["clusterBriefing"]>;
  }>;
}

const MAX_RESTARTS = 2;
const RESTART_SCHEDULE = Schedule.exponential(Duration.millis(300), 2).pipe(
  Schedule.both(Schedule.recurs(MAX_RESTARTS)),
);

const contextMissing = (message: string, cause?: unknown) =>
  new UnitContextMissingError({ message, cause });

/**
 * The parent's fixed demand, present only on outcome nodes (topic mode).
 * `skillMap` arrives as `unknown` here — the plan-node projection deliberately
 * does not model it — so this reads the one field it needs defensively rather
 * than forcing a schema parse of a shape this file otherwise ignores.
 */
const mainOutcomeOf = (skillMap: unknown): string | null => {
  if (typeof skillMap !== "object" || skillMap === null) return null;
  const value = (skillMap as { mainOutcome?: unknown }).mainOutcome;
  return typeof value === "string" && value.trim() ? value : null;
};

const assembleSeedContext = ({
  nodeId,
  planNodes,
  targetIdentity,
  priorLearning,
  knowledge,
}: {
  nodeId: string;
  planNodes: PlanNodeContext[] | null;
  targetIdentity: string | null;
  priorLearning: PriorLearningRecord[];
  knowledge: Awaited<
    ReturnType<UnitPreparationDependencies["getUnitKnowledgeContext"]>
  >;
}): Effect.Effect<UnitBuilderContext, UnitContextMissingError> => {
  if (!planNodes) {
    return Effect.fail(contextMissing("Curriculum plan context is missing."));
  }

  const node = planNodes.find((candidate) => candidate.id === nodeId);
  if (node?.kind !== "unit") {
    return Effect.fail(contextMissing("Education unit plan node is missing."));
  }
  if (!targetIdentity?.trim()) {
    return Effect.fail(contextMissing("Target identity is missing."));
  }
  const parentNode = node.parentNodeId
    ? (planNodes.find((candidate) => candidate.id === node.parentNodeId) ??
      null)
    : null;
  const siblingUnits = planNodes
    .filter(
      (candidate) =>
        candidate.parentNodeId === node.parentNodeId &&
        candidate.kind === node.kind,
    )
    .sort((left, right) => left.orderIndex - right.orderIndex);
  const slotIndex = Math.max(
    siblingUnits.findIndex((candidate) => candidate.id === node.id) + 1,
    1,
  );

  return Effect.succeed({
    node: {
      id: node.id,
      kind: node.kind,
      title: node.title,
      summary: node.summary,
      whyItMatters: node.whyItMatters,
      orderIndex: node.orderIndex,
    },
    planContext: {
      regime: parentNode ? regimeForNodeKind(parentNode.kind) : null,
      slotIndex,
      totalSlots: siblingUnits.length || 1,
      clusterContext: parentNode
        ? {
            title: parentNode.title,
            summary: parentNode.summary,
            whyItMatters: parentNode.whyItMatters,
            mainOutcome: mainOutcomeOf(parentNode.skillMap),
          }
        : null,
    },
    learner: { targetIdentity: targetIdentity.trim(), priorLearning },
    knowledge,
  });
};

/**
 * Takes a unit node, session id, and persistence/provider dependencies;
 * produces the one durable unit-content row; and fails only with a tagged
 * preparation error.
 */
const prepareUnitContentUnlocked = ({
  node,
  sessionId,
  deps,
  forceRefresh = false,
  prepareClusterBriefing,
}: PrepareUnitContentInput): Effect.Effect<UnitContent, UnitPreparationError> =>
  Effect.gen(function* () {
    const existing = yield* Effect.tryPromise({
      try: () => deps.getUnitByNodeId(node.id),
      // Storage failure, not a bad request: keep it out of the
      // UnitContextMissingError channel, which the edge maps to BAD_REQUEST.
      catch: (cause) =>
        new UnitPersistError({
          message: "Unit content lookup failed.",
          cause,
        }),
    });
    if (existing?.unitMasteryContract && !forceRefresh) return existing;
    const replacesExistingContent = existing !== null;

    const briefingPromise = prepareClusterBriefing
      ? prepareClusterBriefing().catch(() => null)
      : Promise.resolve(null);

    const [planNodes, targetIdentity, priorLearning, knowledge] =
      yield* Effect.tryPromise({
        try: () =>
          Promise.all([
            deps.getPlanNodesBySession(sessionId),
            deps.getTargetIdentity(sessionId),
            deps.listAttemptHistory(sessionId),
            deps.getUnitKnowledgeContext(node.id),
          ]),
        catch: (cause) =>
          contextMissing(
            "Unit preparation context could not be loaded.",
            cause,
          ),
      });
    const context = yield* assembleSeedContext({
      nodeId: node.id,
      planNodes,
      targetIdentity,
      priorLearning,
      knowledge,
    });

    const setup = yield* Effect.tryPromise({
      try: () => runSeedStage(context),
      catch: classifyUnitScaffoldFailure,
    }).pipe(
      Effect.timeout(Duration.seconds(45)),
      Effect.mapError((error) =>
        error._tag === "TimeoutError"
          ? new UnitScaffoldError({
              message: "Unit scaffold generation timed out.",
              cause: error,
            })
          : error,
      ),
      Effect.retry({
        schedule: RESTART_SCHEDULE,
        while: isRetryable,
      }),
    );

    const created = yield* Effect.tryPromise({
      try: async () => {
        const persist = replacesExistingContent
          ? deps.replaceUnitContent
          : deps.createUnitContentIfAbsent;
        const persisted = await persist({
          nodeId: node.id,
          title: setup.title,
          seedPrompt: setup.seedPrompt,
          seedHint: setup.seedHint,
          clusterArcFrame: setup.clusterArcFrame,
          complexityBudget: setup.complexityBudget,
          teachbackSetup: setup.teachbackSetup,
          scenario: setup.scenario,
          unitMasteryContract: setup.unitMasteryContract,
        });
        if (!persisted) throw new Error("Unit content write returned no row.");
        return persisted;
      },
      catch: (cause) =>
        new UnitPersistError({
          message: "Unit content could not be saved.",
          cause,
        }),
    });
    const briefing = yield* Effect.promise(() => briefingPromise);
    if (briefing) {
      yield* Effect.promise(() =>
        deps.saveNodeBriefing(briefing).catch(() => null),
      );
    }
    return created;
  });

const lockFailure = (cause: unknown): UnitPreparationError => {
  if (
    cause instanceof UnitContextMissingError ||
    cause instanceof UnitScaffoldError ||
    cause instanceof UnitPersistError
  ) {
    return cause;
  }
  return new UnitPersistError({
    message: "Unit preparation lock failed.",
    cause,
  });
};

/**
 * Takes a unit node, session id, and persistence/provider dependencies;
 * serializes the complete check → generate → persist path for that node; and
 * produces the one durable unit-content row.
 */
export const prepareUnitContent = (
  input: PrepareUnitContentInput,
): Effect.Effect<UnitContent, UnitPreparationError> =>
  Effect.tryPromise({
    try: () =>
      input.deps.withUnitBuildLock(input.node.id, (lockedDeps) =>
        Effect.runPromise(
          prepareUnitContentUnlocked({ ...input, deps: lockedDeps }),
        ),
      ),
    catch: lockFailure,
  });
