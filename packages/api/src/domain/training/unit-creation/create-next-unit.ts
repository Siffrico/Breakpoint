import { Data, Effect } from "effect";

import type { DbError } from "../../../effect/errors";
import type { ScenarioDirective } from "../engine/rating";
import type { UnitPreparationError } from "../unit-preparation/errors";

export interface FrontierEntry {
  id: string;
  label: string;
  gloss: string;
  kind: "discrimination" | "concept" | "subskill" | "vocabulary";
  status: string;
  topicId?: string | null;
  topicOrderIndex?: number | null;
}

export const sliceSyllabusFrontier = (
  entries: readonly FrontierEntry[],
  complexityBudget: 1 | 2 | 3,
): FrontierEntry[] =>
  entries
    .filter((entry) => entry.status === "unchecked")
    .slice(0, complexityBudget);

const selectCreationTargets = (
  entries: readonly FrontierEntry[],
  complexityBudget: 1 | 2 | 3,
) => {
  const unchecked = entries.filter((entry) => entry.status === "unchecked");
  const firstTopicId = [...unchecked]
    .filter((entry) => entry.topicId)
    .sort(
      (left, right) =>
        (left.topicOrderIndex ?? Number.MAX_SAFE_INTEGER) -
        (right.topicOrderIndex ?? Number.MAX_SAFE_INTEGER),
    )[0]?.topicId;
  const topicEntries = firstTopicId
    ? unchecked.filter((entry) => entry.topicId === firstTopicId)
    : [];
  // Topic-less entries (a topicSlug the resolver couldn't match) keep their
  // syllabus dependency position instead of starving behind every topic: any
  // that precede the selected topic's first entry ride in ahead of it.
  const firstTopicPosition = topicEntries[0]
    ? unchecked.indexOf(topicEntries[0])
    : unchecked.length;
  const orphansBefore = unchecked.filter(
    (entry, position) => !entry.topicId && position < firstTopicPosition,
  );
  const frontier = firstTopicId
    ? [...orphansBefore, ...topicEntries].slice(0, complexityBudget)
    : sliceSyllabusFrontier(entries, complexityBudget);
  if (frontier.length > 0) return frontier;
  return entries
    .filter((entry) => entry.status === "checked")
    .slice(-complexityBudget);
};

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
  loadSkill: (
    clusterNodeId: string,
    unitStatus: "planned" | "ready",
  ) => Effect.Effect<
    {
      title: string;
      whyItMatters: string;
      entries: FrontierEntry[];
      openUnit: TNode | null;
    } | null,
    DbError
  >;
  resolveDirective: (clusterNodeId: string) => Effect.Effect<
    {
      directive: ScenarioDirective;
      promptBlock: string;
    },
    DbError
  >;
  appendUnit: (input: {
    clusterNodeId: string;
    title: string;
    summary: string;
    whyItMatters: string;
    difficultyBands: ReturnType<typeof buildDynamicUnitDifficultyBands>;
    targetEntryIds: string[];
    status: "planned" | "ready";
  }) => Effect.Effect<{ node: TNode; created: boolean }, DbError>;
  hasUnitContent: (nodeId: string) => Effect.Effect<boolean, DbError>;
  prepareUnitEffect: (
    node: TNode,
  ) => Effect.Effect<unknown, UnitPreparationError>;
}

export class SkillClusterNotFoundError extends Data.TaggedError(
  "SkillClusterNotFoundError",
)<{ readonly clusterNodeId: string }> {}

export class SyllabusTargetsMissingError extends Data.TaggedError(
  "SyllabusTargetsMissingError",
)<{ readonly clusterNodeId: string }> {}

export type CreateNextUnitError =
  | DbError
  | UnitPreparationError
  | SkillClusterNotFoundError
  | SyllabusTargetsMissingError;

/**
 * Takes a skill frontier, produces its open or newly created unit, and fails
 * only when the skill is missing or its database/scaffold preparation fails.
 */
export const createNextUnit = <TNode extends { id: string }>({
  clusterNodeId,
  complexityBudget = 2,
  status = "ready",
  deps,
}: {
  clusterNodeId: string;
  complexityBudget?: 1 | 2 | 3;
  status?: "planned" | "ready";
  deps: CreateNextUnitDependencies<TNode>;
}): Effect.Effect<TNode | null, CreateNextUnitError> =>
  Effect.gen(function* () {
    const skill = yield* deps.loadSkill(clusterNodeId, status);
    if (!skill) {
      return yield* new SkillClusterNotFoundError({ clusterNodeId });
    }
    if (skill.openUnit) {
      const hasContent = yield* deps.hasUnitContent(skill.openUnit.id);
      if (!hasContent) yield* deps.prepareUnitEffect(skill.openUnit);
      return skill.openUnit;
    }

    const targets = selectCreationTargets(skill.entries, complexityBudget);
    if (targets.length === 0) {
      return yield* new SyllabusTargetsMissingError({ clusterNodeId });
    }
    const calibrated = yield* deps.resolveDirective(clusterNodeId);
    const persisted = yield* deps.appendUnit({
      clusterNodeId,
      title: `Practice ${targets.map((entry) => entry.label).join(" and ")}`,
      summary: `Practice ${targets.map((entry) => entry.gloss).join(" ")}`,
      whyItMatters: skill.whyItMatters,
      difficultyBands: buildDynamicUnitDifficultyBands(calibrated.directive),
      targetEntryIds: targets.map((entry) => entry.id),
      status,
    });
    if (persisted.created) yield* deps.prepareUnitEffect(persisted.node);
    return persisted.node;
  });
