import type { designCurriculum } from "../agents/curriculum-designer";
import type { CurriculumNodeBlueprint } from "../types/training.types";
import { expandSkillBands } from "../engine/rating";

/**
 * Foundation units are criterion-referenced, so a skill node's bandRamp exists
 * only to keep the shared unit machinery calibrated at a modest, fixed span
 * above the ability's floor. It never gates mastery — concept coverage does.
 */
const FOUNDATION_RAMP_SPAN = 200;

/**
 * The v2 plan tree: root → ability → skill. Units are appended dynamically
 * (foundation units under skills, skillset units under abilities) by the
 * progression engine — never authored here.
 *
 * Gating at build time: the first ability and its first skill are `ready`;
 * everything else is `planned`. Foundations run skill-by-skill in dependency
 * order; skillset units unlock only when every skill in the ability is
 * mastered (see engine/plan-progression.ts).
 */
export const buildCurriculumNodes = (
  draft: Awaited<ReturnType<typeof designCurriculum>>["planDraft"],
  targetIdentity: string,
  headline: string,
): CurriculumNodeBlueprint[] => {
  const centerColumn = Math.floor((draft.abilities.length - 1) / 2);
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
  for (const [abilityIndex, ability] of draft.abilities.entries()) {
    const abilityOrderIndex = orderIndex++;
    nodes.push({
      parentOrderIndex: 0,
      kind: "ability",
      status: abilityIndex === 0 ? "ready" : "planned",
      title: ability.title,
      summary: ability.summary,
      whyItMatters: ability.whyItMatters,
      learningGoal: ability.masteryContract.exitCriteria.join(" "),
      orderIndex: abilityOrderIndex,
      depth: 1,
      positionColumn: abilityIndex,
      positionRow: 1,
      difficultyBands: expandSkillBands(ability.bandRamp),
      skillMap: {
        workflow: ability.workflow,
        bandRamp: ability.bandRamp,
        masteryContract: ability.masteryContract,
      },
    });

    for (const [skillIndex, skill] of ability.skills.entries()) {
      nodes.push({
        parentOrderIndex: abilityOrderIndex,
        kind: "skill",
        status: abilityIndex === 0 && skillIndex === 0 ? "ready" : "planned",
        title: skill.title,
        summary: skill.summary,
        whyItMatters: skill.whyItMatters,
        learningGoal: skill.masteryContract.exitCriteria.join(" "),
        orderIndex: orderIndex++,
        depth: 2,
        positionColumn: abilityIndex,
        positionRow: 2 + skillIndex,
        difficultyBands: null,
        skillMap: {
          workflow: skill.workflow,
          bandRamp: {
            startRating: ability.bandRamp.startRating,
            peakRating: ability.bandRamp.startRating + FOUNDATION_RAMP_SPAN,
          },
          masteryContract: skill.masteryContract,
        },
      });
    }
  }

  return nodes;
};
