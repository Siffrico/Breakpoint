import { Duration, Effect, Schedule } from "effect";

import type { CurriculumNode, UnitContent } from "../types/training.types";
import type {
  PriorLearningRecord,
  UnitBuilderContext,
} from "../unit-builder/contracts";
import type { UnitPreparationError } from "./errors";
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
  readonly getUnitSyllabusContext: (unitNodeId: string) => Promise<{
    workflow: { name: string; steps: string[] };
    checked: { label: string; gloss: string }[];
    targets: { id: string; label: string; gloss: string }[];
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
  }) => Promise<UnitContent | null>;
}

export interface PrepareUnitContentInput {
  readonly node: Pick<CurriculumNode, "id">;
  readonly sessionId: string;
  readonly deps: UnitPreparationDependencies;
  readonly forceRefresh?: boolean;
}

const MAX_RESTARTS = 2;
const RESTART_SCHEDULE = Schedule.exponential(Duration.millis(300), 2).pipe(
  Schedule.both(Schedule.recurs(MAX_RESTARTS)),
);

const contextMissing = (message: string, cause?: unknown) =>
  new UnitContextMissingError({ message, cause });

const assembleSeedContext = ({
  nodeId,
  planNodes,
  targetIdentity,
  priorLearning,
  syllabus,
}: {
  nodeId: string;
  planNodes: PlanNodeContext[] | null;
  targetIdentity: string | null;
  priorLearning: PriorLearningRecord[];
  syllabus: Awaited<
    ReturnType<UnitPreparationDependencies["getUnitSyllabusContext"]>
  >;
}): Effect.Effect<UnitBuilderContext, UnitContextMissingError> => {
  if (!planNodes) {
    return Effect.fail(contextMissing("Curriculum plan context is missing."));
  }

  const node = planNodes.find((candidate) => candidate.id === nodeId);
  if (!node || (node.kind !== "unit" && node.kind !== "integration")) {
    return Effect.fail(contextMissing("Education unit plan node is missing."));
  }
  if (!targetIdentity?.trim()) {
    return Effect.fail(contextMissing("Target identity is missing."));
  }
  const parentNode = node.parentNodeId
    ? (planNodes.find((candidate) => candidate.id === node.parentNodeId) ??
      null)
    : null;
  if (
    parentNode?.kind === "skill_cluster" &&
    parentNode.skillMap &&
    !syllabus
  ) {
    return Effect.fail(contextMissing("Unit syllabus targets are missing."));
  }
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
  const completedClusterTitles = planNodes
    .filter((candidate) => candidate.kind === "skill_cluster")
    .filter((cluster) => {
      const children = planNodes.filter(
        (candidate) =>
          candidate.parentNodeId === cluster.id && candidate.kind === "unit",
      );
      return (
        children.length > 0 &&
        children.every((candidate) => candidate.status === "completed")
      );
    })
    .map((candidate) => candidate.title);

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
      slotIndex,
      totalSlots: siblingUnits.length || 1,
      clusterContext: parentNode
        ? {
            title: parentNode.title,
            summary: parentNode.summary,
            whyItMatters: parentNode.whyItMatters,
          }
        : null,
      integrationContext:
        node.kind === "integration" ? { completedClusterTitles } : null,
    },
    learner: { targetIdentity: targetIdentity.trim(), priorLearning },
    syllabus,
  });
};

/**
 * Takes a unit node, session id, and persistence/provider dependencies;
 * produces the one durable unit-content row; and fails only with a tagged
 * preparation error.
 */
export const prepareUnitContent = ({
  node,
  sessionId,
  deps,
  forceRefresh = false,
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
    if (existing && !forceRefresh) return existing;

    const [planNodes, targetIdentity, priorLearning, syllabus] =
      yield* Effect.tryPromise({
        try: () =>
          Promise.all([
            deps.getPlanNodesBySession(sessionId),
            deps.getTargetIdentity(sessionId),
            deps.listAttemptHistory(sessionId),
            deps.getUnitSyllabusContext(node.id),
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
      syllabus,
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

    return yield* Effect.tryPromise({
      try: async () => {
        const persist = forceRefresh
          ? deps.replaceUnitContent
          : deps.createUnitContentIfAbsent;
        const created = await persist({
          nodeId: node.id,
          title: setup.title,
          seedPrompt: setup.seedPrompt,
          seedHint: setup.seedHint,
          clusterArcFrame: setup.clusterArcFrame,
          complexityBudget: setup.complexityBudget,
          teachbackSetup: setup.teachbackSetup,
          scenario: setup.scenario,
        });
        if (!created) throw new Error("Unit content write returned no row.");
        return created;
      },
      catch: (cause) =>
        new UnitPersistError({
          message: "Unit content could not be saved.",
          cause,
        }),
    });
  });
