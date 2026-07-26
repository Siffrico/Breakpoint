import { Data, Effect } from "effect";

import type { DbError } from "../../../effect/errors";
import type { ScenarioDirective } from "../engine/rating";
import type { UnitPreparationError } from "../unit-preparation/errors";
import type {
  FrontierItem,
  UnitCreationRegime,
  UnitTargetSelector,
} from "./target-selection";

export type {
  FrontierItem,
  UnitCreationRegime,
  UnitTargetSelector,
} from "./target-selection";

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
  ) => Effect.Effect<TNode | null, DbError>;
  loadSkill: (
    skillNodeId: string,
    unitStatus: "planned" | "ready",
  ) => Effect.Effect<
    {
      title: string;
      whyItMatters: string;
      regime: UnitCreationRegime;
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
    /** The child skill this unit is a rep of; null for foundation units. */
    practicedSkillNodeId: string | null;
    status: "planned" | "ready";
  }) => Effect.Effect<{ node: TNode; created: boolean }, DbError>;
  hasUnitContent: (nodeId: string) => Effect.Effect<boolean, DbError>;
  prepareUnitEffect: (
    node: TNode,
  ) => Effect.Effect<unknown, UnitPreparationError>;
  /**
   * Which entries the new unit is accountable for. Injected because it is the
   * only step that differs between foundation and skillset units — see
   * target-selection.ts for the two strategies and the default wiring.
   */
  selectTargets: UnitTargetSelector;
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
  deps,
}: {
  skillNodeId: string;
  complexityBudget?: 1 | 2 | 3;
  status?: "planned" | "ready";
  deps: CreateNextUnitDependencies<TNode>;
}): Effect.Effect<
  { node: TNode; needsContent: boolean },
  CreateNextUnitError
> =>
  Effect.gen(function* () {
    const skill = yield* deps.loadSkill(skillNodeId, status);
    if (!skill) {
      return yield* new SkillClusterNotFoundError({ skillNodeId });
    }
    if (skill.openUnit) {
      const hasContent = yield* deps.hasUnitContent(skill.openUnit.id);
      return { node: skill.openUnit, needsContent: !hasContent };
    }

    const targets = yield* deps.selectTargets({
      skillNodeId,
      regime: skill.regime,
      entries: skill.entries,
      complexityBudget,
    });
    if (targets.length === 0) {
      return yield* new KnowledgeTargetsMissingError({ skillNodeId });
    }
    const calibrated = yield* deps.resolveDirective(skillNodeId);
    const foundationQuestion =
      skill.regime === "foundation" ? targets[0]?.question : null;
    // The selector returns entries from exactly one owning skill, so the lead
    // entry names the skill this unit is a rep of. Foundation units record
    // nothing: their owning skill is already their parent node.
    const practicedSkillNodeId =
      skill.regime === "skillset" ? (targets[0]?.ownerSkillId ?? null) : null;
    const persisted = yield* deps.appendUnit({
      skillNodeId,
      title:
        foundationQuestion ??
        `Practice ${targets.map((entry) => entry.label).join(" and ")}`,
      summary: targets.map((entry) => entry.content).join(" "),
      whyItMatters: skill.whyItMatters,
      difficultyBands: buildDynamicUnitDifficultyBands(calibrated.directive),
      targetKnowledgeIds: targets.map((entry) => entry.id),
      practicedSkillNodeId,
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
  deps,
}: {
  skillNodeId: string;
  complexityBudget?: 1 | 2 | 3;
  status?: "planned" | "ready";
  deps: CreateNextUnitDependencies<TNode>;
}): Effect.Effect<TNode | null, CreateNextUnitError> =>
  Effect.gen(function* () {
    const openUnit = yield* deps.loadOpenUnit(skillNodeId, status);
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
      deps,
    });
    if (created.needsContent) yield* deps.prepareUnitEffect(created.node);
    return created.node;
  });
