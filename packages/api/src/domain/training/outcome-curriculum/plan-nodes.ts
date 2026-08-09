import type { CurriculumNodeBlueprint } from "../types/training.types";
import type { OutcomeDefinition } from "./contracts";

export const buildOutcomeNodes = ({
  outcomes,
  targetIdentity,
  summary,
}: {
  outcomes: readonly OutcomeDefinition[];
  targetIdentity: string;
  summary: string;
}): CurriculumNodeBlueprint[] => {
  const centerColumn = Math.floor((outcomes.length - 1) / 2);
  const nodes: CurriculumNodeBlueprint[] = [
    {
      parentOrderIndex: null,
      kind: "root",
      status: "completed",
      title: targetIdentity,
      summary,
      whyItMatters: summary,
      learningGoal: summary,
      orderIndex: 0,
      depth: 0,
      positionColumn: centerColumn,
      positionRow: 0,
      difficultyBands: null,
      outcomeResult: null,
      skillMap: null,
      practiceContract: null,
    },
  ];

  outcomes.forEach((outcome, index) => {
    nodes.push({
      parentOrderIndex: 0,
      kind: "outcome",
      status: index === 0 ? "ready" : "planned",
      title: outcome.title,
      summary: outcome.result,
      whyItMatters: outcome.result,
      learningGoal: outcome.result,
      orderIndex: index + 1,
      depth: 1,
      positionColumn: index,
      positionRow: 1,
      difficultyBands: null,
      outcomeResult: outcome.result,
      skillMap: null,
      practiceContract: null,
    });
  });

  return nodes;
};
