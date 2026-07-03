import type { ScenarioDirective } from "../engine/rating";

export interface FrontierEntry {
  id: string;
  label: string;
  gloss: string;
  kind: "discrimination" | "concept" | "subskill" | "vocabulary";
  status: string;
}

export const sliceSyllabusFrontier = (
  entries: readonly FrontierEntry[],
  complexityBudget: 1 | 2 | 3,
): FrontierEntry[] =>
  entries
    .filter((entry) => entry.status === "unchecked")
    .slice(0, complexityBudget);

const selectMintTargets = (
  entries: readonly FrontierEntry[],
  complexityBudget: 1 | 2 | 3,
) => {
  const frontier = sliceSyllabusFrontier(entries, complexityBudget);
  if (frontier.length > 0) return frontier;
  return entries
    .filter((entry) => entry.status === "checked")
    .slice(-complexityBudget);
};

export const buildMintedDifficultyBands = (
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

export interface MintNextUnitDependencies<TNode> {
  loadSkill: (clusterNodeId: string) => Promise<{
    title: string;
    whyItMatters: string;
    entries: FrontierEntry[];
    openUnit: TNode | null;
  } | null>;
  resolveDirective: (clusterNodeId: string) => Promise<{
    directive: ScenarioDirective;
    promptBlock: string;
  }>;
  appendUnit: (input: {
    clusterNodeId: string;
    title: string;
    summary: string;
    whyItMatters: string;
    difficultyBands: ReturnType<typeof buildMintedDifficultyBands>;
    targetEntryIds: string[];
  }) => Promise<{ node: TNode; created: boolean }>;
  prepareUnit: (node: TNode) => Promise<void>;
}

export const mintNextUnit = async <TNode>({
  clusterNodeId,
  complexityBudget = 2,
  deps,
}: {
  clusterNodeId: string;
  complexityBudget?: 1 | 2 | 3;
  deps: MintNextUnitDependencies<TNode>;
}): Promise<TNode | null> => {
  const skill = await deps.loadSkill(clusterNodeId);
  if (!skill) throw new Error("Skill cluster was not found.");
  if (skill.openUnit) return skill.openUnit;

  const targets = selectMintTargets(skill.entries, complexityBudget);
  if (targets.length === 0) return null;
  const calibrated = await deps.resolveDirective(clusterNodeId);
  const persisted = await deps.appendUnit({
    clusterNodeId,
    title: `Practice ${targets.map((entry) => entry.label).join(" and ")}`,
    summary: `Practice ${targets.map((entry) => entry.gloss).join(" ")}`,
    whyItMatters: skill.whyItMatters,
    difficultyBands: buildMintedDifficultyBands(calibrated.directive),
    targetEntryIds: targets.map((entry) => entry.id),
  });
  if (persisted.created) await deps.prepareUnit(persisted.node);
  return persisted.node;
};
