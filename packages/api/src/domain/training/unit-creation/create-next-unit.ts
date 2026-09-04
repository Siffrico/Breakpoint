import { Data, Effect } from "effect";

import type { DbError } from "../../../effect/errors";
import type { ScenarioDirective } from "../engine/rating";
import type { UnitPreparationError } from "../unit-preparation/errors";
import type { FrontierItem } from "./target-selection";
import { selectNextPracticeSkill } from "./target-selection";

export type { FrontierItem } from "./target-selection";

/**
 * Fallback-only. Rating reads resolve bands from the parent skill cluster
 * first (see `resolveRatingScope`), and every dynamic cluster is written with
 * bands at plan-build time, so this local ±180 ladder on the dynamically created unit node
 * is only consulted if a cluster somehow loses its bands. It is not the live
 * difficulty config — tune `expandSkillBands` / the cluster bands instead.
 */
export const buildDynamicUnitDifficultyBands = (
  directive: Pick<ScenarioDirective, "targetItemRating">,
) => {
  const center = directive.targetItemRating;
  return [
    {
      order: 0,
      minRating: center - 180,
      maxRating: center - 60,
      label: "Supported",
    },
    {
      order: 1,
      minRating: center - 60,
      maxRating: center + 60,
      label: "Target",
    },
    {
      order: 2,
      minRating: center + 60,
      maxRating: center + 180,
      label: "Stretch",
    },
  ];
};

export interface CreateNextUnitDependencies<TNode> {
  ensureSkillKnowledge: (
    skillNodeId: string,
  ) => Effect.Effect<unknown, DbError>;
  loadOpenUnit: (
    skillNodeId: string,
    unitStatus: "planned" | "ready",
    excludeUnitNodeId?: string,
  ) => Effect.Effect<TNode | null, DbError>;
  loadSkill: (
    skillNodeId: string,
    unitStatus: "planned" | "ready",
    excludeUnitNodeId?: string,
  ) => Effect.Effect<
    {
      title: string;
      whyItMatters: string;
      entries: FrontierItem[];
      openUnit: TNode | null;
    } | null,
    DbError
  >;
  resolveDirective: (skillNodeId: string) => Effect.Effect<
    {
      directive: ScenarioDirective;
      promptBlock: string;
    },
    DbError
  >;
  appendUnit: (input: {
    skillNodeId: string;
    title: string;
    summary: string;
    whyItMatters: string;
    difficultyBands: ReturnType<typeof buildDynamicUnitDifficultyBands>;
    targetKnowledgeIds: string[];
    status: "planned" | "ready";
  }) => Effect.Effect<{ node: TNode; created: boolean }, DbError>;
  hasUnitContent: (nodeId: string) => Effect.Effect<boolean, DbError>;
  prepareUnitEffect: (
    node: TNode,
  ) => Effect.Effect<unknown, UnitPreparationError>;
}

export class SkillClusterNotFoundError extends Data.TaggedError(
  "SkillClusterNotFoundError",
)<{ readonly skillNodeId: string }> {}

export class KnowledgeTargetsMissingError extends Data.TaggedError(
  "KnowledgeTargetsMissingError",
)<{ readonly skillNodeId: string }> {}

export type CreateNextUnitError =
  | DbError
  | UnitPreparationError
  | SkillClusterNotFoundError
  | KnowledgeTargetsMissingError;

/**
 * The node-only half of unit creation: resolves or appends the frontier unit
 * row without generating content. Kept separate so callers that must not hold
 * a lock or transaction across the LLM call (pre-generation) can create the
 * node quickly and run content preparation afterwards.
 */
export const createNextUnitNode = <TNode extends { id: string }>({
  skillNodeId,
  complexityBudget = 2,
  status = "ready",
  excludeUnitNodeId,
  deps,
}: {
  skillNodeId: string;
  complexityBudget?: 1 | 2 | 3;
  status?: "planned" | "ready";
  excludeUnitNodeId?: string;
  deps: CreateNextUnitDependencies<TNode>;
}): Effect.Effect<
  { node: TNode; needsContent: boolean },
  CreateNextUnitError
> =>
  Effect.gen(function* () {
    const skill = yield* deps.loadSkill(skillNodeId, status, excludeUnitNodeId);
    if (!skill) {
      return yield* new SkillClusterNotFoundError({ skillNodeId });
    }
    if (skill.openUnit) {
      const hasContent = yield* deps.hasUnitContent(skill.openUnit.id);
      return { node: skill.openUnit, needsContent: !hasContent };
    }

    const selection = selectNextPracticeSkill(skill.entries, complexityBudget);
    if (!selection || selection.targets.length === 0) {
      return yield* new KnowledgeTargetsMissingError({ skillNodeId });
    }
    const targets = selection.targets;
    const calibrated = yield* deps.resolveDirective(skillNodeId);
    const persisted = yield* deps.appendUnit({
      skillNodeId,
      title: `Practice ${selection.skillName}`,
      summary: targets.map((entry) => entry.content).join(" "),
      whyItMatters: skill.whyItMatters,
      difficultyBands: buildDynamicUnitDifficultyBands(calibrated.directive),
      targetKnowledgeIds: targets.map((entry) => entry.id),
      status,
    });
    if (persisted.created) return { node: persisted.node, needsContent: true };
    const hasContent = yield* deps.hasUnitContent(persisted.node.id);
    return { node: persisted.node, needsContent: !hasContent };
  });

/**
 * Takes a skill frontier, produces its open or newly created unit, and fails
 * only when the skill is missing or its database/scaffold preparation fails.
 */
export const createNextUnit = <TNode extends { id: string }>({
  skillNodeId,
  complexityBudget = 2,
  status = "ready",
  excludeUnitNodeId,
  deps,
}: {
  skillNodeId: string;
  complexityBudget?: 1 | 2 | 3;
  status?: "planned" | "ready";
  excludeUnitNodeId?: string;
  deps: CreateNextUnitDependencies<TNode>;
}): Effect.Effect<TNode | null, CreateNextUnitError> =>
  Effect.gen(function* () {
    const openUnit = yield* deps.loadOpenUnit(
      skillNodeId,
      status,
      excludeUnitNodeId,
    );
    if (openUnit) {
      const hasContent = yield* deps.hasUnitContent(openUnit.id);
      if (!hasContent) yield* deps.prepareUnitEffect(openUnit);
      return openUnit;
    }

    yield* deps.ensureSkillKnowledge(skillNodeId);
    const created = yield* createNextUnitNode({
      skillNodeId,
      complexityBudget,
      status,
      excludeUnitNodeId,
      deps,
    });
    if (created.needsContent) yield* deps.prepareUnitEffect(created.node);
    return created.node;
  });
