import type { designCurriculum } from "../agents/curriculum-designer";
import type { CurriculumNodeBlueprint } from "../types/training.types";
import { foundationCalibrationRamp } from "../engine/progression-model";
import { deriveCanonicalDifficultyBands } from "../engine/rating";
import { ARCHETYPE_FORMATS } from "../engine/scenario-archetypes";

/**
 * The v2 plan tree: root → ability → skill. Units are appended dynamically
 * (foundation units under skills, skillset units under abilities) by the
 * progression engine — never authored here.
 *
 * Gating at build time: the first ability and its first skill are `ready`;
 * everything else is `planned`. An ability's `ready` status only makes its
 * track visible — every ability starts at stage "foundations", and its
 * skillset climb opens via an explicit stage change once all child skills
 * are mastered (see engine/plan-progression.ts / progression-model.ts).
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
      abilityStage: null,
      skillMap: null,
    },
  ];

  let orderIndex = 1;
  for (const [abilityIndex, ability] of draft.abilities.entries()) {
    const abilityOrderIndex = orderIndex++;
    const difficultyBands = [
      ...deriveCanonicalDifficultyBands(
        ARCHETYPE_FORMATS[ability.scenarioArchetype],
      ),
    ];
    const firstBand = difficultyBands[0];
    const topBand = difficultyBands.at(-1);
    if (!firstBand || !topBand) {
      throw new RangeError("Canonical difficulty bands must not be empty.");
    }
    const bandRamp = {
      startRating: firstBand.maxRating,
      peakRating: topBand.maxRating,
    };
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
      difficultyBands,
      abilityStage: "foundations",
      skillMap: {
        workflow: ability.workflow,
        bandRamp,
        masteryContract: ability.masteryContract,
        scenarioArchetype: ability.scenarioArchetype,
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
        abilityStage: null,
        skillMap: {
          workflow: skill.workflow,
          // Difficulty calibration only (see progression-model.ts): the
          // foundation regime has no rating gate, so this ramp never gates.
          bandRamp: foundationCalibrationRamp(bandRamp),
          masteryContract: skill.masteryContract,
          scenarioArchetype: ability.scenarioArchetype,
        },
      });
    }
  }

  return nodes;
};
