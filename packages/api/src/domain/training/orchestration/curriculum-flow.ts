import type { designCurriculum } from "../agents/curriculum-designer";
import type { CurriculumNodeBlueprint } from "../types/training.types";
import { expandSkillBands } from "../engine/rating";

export const buildCurriculumNodes = (
  draft: Awaited<ReturnType<typeof designCurriculum>>["planDraft"],
  targetIdentity: string,
  headline: string,
): CurriculumNodeBlueprint[] => {
  const centerColumn = Math.floor((draft.clusters.length - 1) / 2);
  const nodes: CurriculumNodeBlueprint[] = [
    {
      parentOrderIndex: null,
      kind: "root",
      status: "completed",
      title: targetIdentity,
      summary: headline,
      whyItMatters:
        "This path exists because of the operator the learner wants to become.",
      learningGoal:
        "Use this path to turn the target identity into observable decisions and execution.",
      orderIndex: 0,
      depth: 0,
      positionColumn: centerColumn,
      positionRow: 0,
      difficultyBands: null,
      skillMap: null,
    },
  ];

  let orderIndex = 1;
  for (const [clusterIndex, cluster] of draft.clusters.entries()) {
    const clusterOrderIndex = orderIndex++;
    nodes.push({
      parentOrderIndex: 0,
      kind: "skill_cluster",
      status: "ready",
      title: cluster.title,
      summary: cluster.summary,
      whyItMatters: cluster.whyItMatters,
      learningGoal: cluster.masteryContract.exitCriteria.join(" "),
      orderIndex: clusterOrderIndex,
      depth: 1,
      positionColumn: clusterIndex,
      positionRow: 1,
      difficultyBands: expandSkillBands(cluster.bandRamp),
      skillMap: {
        workflow: cluster.workflow,
        bandRamp: cluster.bandRamp,
        masteryContract: cluster.masteryContract,
      },
    });
    nodes.push({
      parentOrderIndex: clusterOrderIndex,
      kind: "simulation",
      status: "planned",
      title: cluster.simulation.title,
      summary: cluster.simulation.summary,
      whyItMatters: cluster.simulation.whyItMatters,
      learningGoal: cluster.masteryContract.exitCriteria.join(" "),
      orderIndex: orderIndex++,
      depth: 2,
      positionColumn: clusterIndex,
      positionRow: 2,
      difficultyBands: null,
      skillMap: null,
    });
  }

  return nodes;
};
