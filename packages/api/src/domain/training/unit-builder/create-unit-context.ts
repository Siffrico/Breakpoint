import { UnitContextSchema } from "@acme/validators";

import type { UnitBuilderContext } from "./contracts";

const intersects = (
  values: readonly string[],
  selected: ReadonlySet<string>,
): boolean => values.some((value) => selected.has(value));

/**
 * Projects one unit's immutable teaching, testing, and judgment assignment
 * directly from the compiled outcome curriculum and selected frontier items.
 */
export const createUnitContext = (context: UnitBuilderContext) => {
  const contract = context.planContext.clusterContext?.taskContract;
  const targets = context.knowledge?.targets;
  if (!contract || !targets || targets.length === 0) {
    throw new Error(
      "A unit context requires an outcome contract and selected knowledge targets.",
    );
  }

  const selectedSkills = new Set(targets.map((target) => target.skill));
  const taskTypes = contract.practiceContract.taskTypes.filter((task) =>
    intersects(task.skills, selectedSkills),
  );
  const criteria = contract.practiceContract.evaluationCriteria.flatMap(
    (criterion, index) =>
      intersects(criterion.skills, selectedSkills)
        ? [
            {
              id: `criterion-${index + 1}`,
              criterion: criterion.criterion,
              skills: criterion.skills,
            },
          ]
        : [],
  );

  if (taskTypes.length === 0 || criteria.length === 0) {
    throw new Error(
      "The selected knowledge targets are not covered by the outcome Practice Contract.",
    );
  }

  return UnitContextSchema.parse({
    version: 1,
    performance: contract.outcomeResult,
    targets,
    workflow: contract.practiceContract.workflow,
    expertise: {
      expertJudgment: contract.skillMap.expertJudgment,
      commonMistakes: contract.skillMap.commonMistakes,
    },
    testing: {
      responseMode: contract.practiceContract.responseMode,
      taskTypes,
      variationAxes: contract.practiceContract.variationAxes,
      neverDo: contract.practiceContract.neverDo,
    },
    judgment: {
      criteria,
      qualityBar: contract.practiceContract.qualityBar,
    },
  });
};
