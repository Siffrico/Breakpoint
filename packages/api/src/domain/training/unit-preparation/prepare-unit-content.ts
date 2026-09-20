import { Effect } from "effect";

import type { CurriculumNode, UnitContent } from "../types/training.types";
import type { UnitPreparationError } from "./errors";
import { getUnitReadinessIssue } from "../education-unit/unit-readiness";
import { OutcomeTaskContractSchema } from "../unit-builder/contracts";
import { createUnitContext } from "../unit-builder/create-unit-context";
import { UnitContextMissingError, UnitPersistError } from "./errors";

interface PlanNodeContext {
  readonly id: string;
  readonly parentNodeId: string | null;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly whyItMatters: string;
  readonly orderIndex: number;
  readonly status: string;
  readonly outcomeResult?: unknown;
  readonly skillMap?: unknown;
  readonly practiceContract?: unknown;
}

export interface UnitPreparationDependencies {
  readonly getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  readonly getPlanNodesBySession: (
    sessionId: string,
  ) => Promise<PlanNodeContext[] | null>;
  readonly getUnitKnowledgeContext: (unitNodeId: string) => Promise<{
    targets: {
      id: string;
      skill: string;
      kind: "concept" | "mechanism";
      label: string;
      content: string;
    }[];
  } | null>;
  readonly createUnitContentIfAbsent: (input: {
    nodeId: string;
    title: string;
    clusterArcFrame: string;
    scenario: UnitContent["scenario"];
    unitContext: NonNullable<UnitContent["unitContext"]>;
  }) => Promise<UnitContent | null>;
  readonly replaceUnitContent: (input: {
    nodeId: string;
    title: string;
    clusterArcFrame: string;
    scenario: UnitContent["scenario"];
    unitContext: NonNullable<UnitContent["unitContext"]>;
  }) => Promise<UnitContent | null>;
  readonly saveNodeBriefing: (input: {
    nodeId: string;
    briefing: NonNullable<UnitContent["clusterBriefing"]>;
  }) => Promise<UnitContent["clusterBriefing"]>;
  /** Runs `build` only for the lease owner and `loadReady` after another owner
   * has committed. An explicit rebuild must reacquire the lease first. */
  readonly withUnitBuildLock: <T>(
    nodeId: string,
    build: (lockedDeps: UnitPreparationDependencies) => Promise<T>,
    loadReady: (deps: UnitPreparationDependencies) => Promise<T>,
    options?: { readonly rebuildReady?: boolean },
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

const contextMissing = (message: string, cause?: unknown) =>
  new UnitContextMissingError({ message, cause });

const outcomeTaskContractOf = (node: PlanNodeContext | null | undefined) => {
  const parsed = OutcomeTaskContractSchema.safeParse({
    outcomeResult: node?.outcomeResult,
    skillMap: node?.skillMap,
    practiceContract: node?.practiceContract,
  });
  return parsed.success ? parsed.data : null;
};

/**
 * Takes a unit node, session id, and persistence dependencies;
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
    if (existing && getUnitReadinessIssue(existing) === null && !forceRefresh) {
      return existing;
    }
    const replacesExistingContent = existing !== null;

    const briefingPromise = prepareClusterBriefing
      ? prepareClusterBriefing().catch(() => null)
      : Promise.resolve(null);

    const [planNodes, knowledge] = yield* Effect.tryPromise({
      try: () =>
        Promise.all([
          deps.getPlanNodesBySession(sessionId),
          deps.getUnitKnowledgeContext(node.id),
        ]),
      catch: (cause) =>
        new UnitPersistError({
          message: "Unit preparation context could not be loaded.",
          cause,
        }),
    });
    const planNode = planNodes?.find((candidate) => candidate.id === node.id);
    if (planNode?.kind !== "unit") {
      return yield* contextMissing("Education unit plan node is missing.");
    }
    const parent = planNodes?.find(
      (candidate) => candidate.id === planNode.parentNodeId,
    );
    const contract = outcomeTaskContractOf(parent);
    if (!contract || !knowledge?.targets.length) {
      return yield* contextMissing(
        "Outcome contract or selected knowledge targets are missing.",
      );
    }
    const unitContext = yield* Effect.try({
      try: () => createUnitContext({ contract, targets: knowledge.targets }),
      catch: (cause) =>
        contextMissing(
          "Authoritative unit context could not be created.",
          cause,
        ),
    });

    const created = yield* Effect.tryPromise({
      try: async () => {
        const persist = replacesExistingContent
          ? deps.replaceUnitContent
          : deps.createUnitContentIfAbsent;
        const persisted = await persist({
          nodeId: node.id,
          title: planNode.title,
          clusterArcFrame: planNode.summary,
          scenario: {
            title: planNode.title,
            focusAreas: unitContext.targets.map((target) => target.label),
          },
          unitContext,
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
      const savedBriefing = yield* Effect.promise(() =>
        deps.saveNodeBriefing(briefing).catch(() => null),
      );
      if (savedBriefing) return { ...created, clusterBriefing: savedBriefing };
    }
    return created;
  });

/**
 * `withUnitBuildLock` is a Promise API, so the inner effect's typed error
 * channel is erased at the boundary and `lockFailure` has to rebuild the union
 * from `unknown`. Keying that reconstruction off the union's own `_tag` makes
 * it the compiler's problem: a new member of `UnitPreparationError` fails
 * to typecheck here until it is listed, instead of silently falling through to
 * the "lock failed" branch and reaching the edge with the wrong diagnosis.
 */
const unitPreparationTags: Record<UnitPreparationError["_tag"], true> = {
  UnitContextMissingError: true,
  UnitPersistError: true,
};

const isUnitPreparationError = (
  cause: unknown,
): cause is UnitPreparationError =>
  cause instanceof Error &&
  "_tag" in cause &&
  typeof cause._tag === "string" &&
  cause._tag in unitPreparationTags;

const lockFailure = (cause: unknown): UnitPreparationError =>
  isUnitPreparationError(cause)
    ? cause
    : new UnitPersistError({
        message: "Unit preparation lock failed.",
        cause,
      });

const loadReadyUnitContent = async (
  deps: UnitPreparationDependencies,
  nodeId: string,
): Promise<UnitContent> => {
  const unit = await deps.getUnitByNodeId(nodeId);
  if (!unit) {
    throw new UnitPersistError({
      message: "Prepared unit content could not be loaded.",
    });
  }
  return unit;
};

/**
 * Takes a unit node, session id, and persistence dependencies;
 * serializes the complete check → derive → persist path for that node; and
 * produces the one durable unit-content row.
 */
export const prepareUnitContent = (
  input: PrepareUnitContentInput,
): Effect.Effect<UnitContent, UnitPreparationError> =>
  Effect.tryPromise({
    try: () =>
      input.deps.withUnitBuildLock(
        input.node.id,
        (lockedDeps) =>
          Effect.runPromise(
            prepareUnitContentUnlocked({ ...input, deps: lockedDeps }),
          ),
        (readyDeps) => loadReadyUnitContent(readyDeps, input.node.id),
        { rebuildReady: input.forceRefresh },
      ),
    catch: lockFailure,
  });
