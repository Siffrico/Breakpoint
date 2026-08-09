import { Effect } from "effect";

import type { DbError } from "../../../effect/errors";

export interface FrontierItem {
  id: string;
  questionId: string;
  question: string;
  questionOrderIndex: number;
  kind: "concept" | "mechanism";
  label: string;
  content: string;
  status: string;
  orderIndex: number;
  coverageCount?: number;
}

export type UnitCreationRegime = "main_outcome" | null;

export const selectLeastCoveredTargets = (
  entries: readonly FrontierItem[],
  complexityBudget: 1 | 2 | 3,
): FrontierItem[] => {
  const unchecked = entries.filter((entry) => entry.status === "unchecked");
  const pool = unchecked.length > 0 ? unchecked : entries;
  return [...pool]
    .sort(
      (left, right) =>
        (left.coverageCount ?? 0) - (right.coverageCount ?? 0) ||
        left.questionOrderIndex - right.questionOrderIndex ||
        left.orderIndex - right.orderIndex,
    )
    .slice(0, complexityBudget);
};

export interface UnitTargetSelectorInput {
  skillNodeId: string;
  regime: UnitCreationRegime;
  entries: readonly FrontierItem[];
  complexityBudget: 1 | 2 | 3;
}

export type UnitTargetSelector = (
  input: UnitTargetSelectorInput,
) => Effect.Effect<readonly FrontierItem[], DbError>;

export const createRegimeTargetSelector =
  (): UnitTargetSelector =>
  ({ entries, complexityBudget }) =>
    Effect.succeed(selectLeastCoveredTargets(entries, complexityBudget));
