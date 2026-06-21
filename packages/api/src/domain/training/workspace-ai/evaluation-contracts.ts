import {
  ScenarioEvaluationContractSchema,
  UnitMasteryContractSchema,
} from "@acme/validators";

import type {
  ScenarioEvaluationContract,
  UnitContent,
  UnitMasteryContract,
} from "../types/training.types";
import type { WorkspaceAiEducationStage } from "./types";

const slugifyDimensionId = (value: string, fallback: string) => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug.length >= 2 ? slug : fallback;
};

export const buildLegacyUnitMasteryContract = (
  unit: UnitContent,
): UnitMasteryContract =>
  UnitMasteryContractSchema.parse({
    version: 1,
    dimensions: (unit.scenario.focusAreas.length
      ? unit.scenario.focusAreas
      : [unit.learningGoal]
    )
      .slice(0, 3)
      .map((focusArea, index) => ({
        id: slugifyDimensionId(focusArea, `dimension-${index + 1}`),
        name: focusArea,
        description: `Demonstrates the unit goal in this area: ${focusArea}`,
        passSignals: [
          "Uses concrete scenario evidence instead of generic restatement.",
          "Explains the mechanism or tradeoff behind the answer.",
        ],
        failSignals: [
          "Stays at the level of labels without applying them.",
          "Misses the consequence that makes this unit matter.",
        ],
        surrogateTraps: [
          "Fluent but generic advice.",
          "Surface keyword matching without causal reasoning.",
        ],
      })),
  });

export const buildLegacyScenarioEvaluationContract = ({
  unit,
  stage,
  scenarioPrompt,
}: {
  unit: UnitContent;
  stage: WorkspaceAiEducationStage | "recall";
  scenarioPrompt: string;
}): ScenarioEvaluationContract => {
  const unitContract =
    unit.unitMasteryContract ?? buildLegacyUnitMasteryContract(unit);

  return ScenarioEvaluationContractSchema.parse({
    version: 1,
    scenarioStage: stage,
    scenarioPromptSummary: scenarioPrompt.slice(0, 480),
    testedDimensions: unitContract.dimensions.map((dimension) => ({
      dimensionId: dimension.id,
      promptRole: `This scenario tests whether the learner can apply ${dimension.name}.`,
      expectedStrongMoves: dimension.passSignals,
      acceptableVariants: [],
      commonWrongMoves: dimension.failSignals,
      scoreBands: {
        strong: "Clear applied reasoning with scenario-specific evidence.",
        partial:
          "Some correct reasoning, but missing precision or consequences.",
        weak: "Generic, unsupported, or driven by a surrogate pattern.",
      },
    })),
    learnerVisibleCriteria: unitContract.dimensions.map(
      (dimension) => dimension.name,
    ),
    evaluatorNotes: [
      "Legacy contract generated from persisted unit context because no private scenario contract was stored.",
    ],
  });
};

export const validateScenarioContractAgainstUnit = ({
  unitContract,
  scenarioContract,
}: {
  unitContract: UnitMasteryContract;
  scenarioContract: ScenarioEvaluationContract;
}) => {
  const unitDimensionIds = new Set(
    unitContract.dimensions.map((dimension) => dimension.id),
  );
  const invalidDimensionIds = scenarioContract.testedDimensions
    .map((dimension) => dimension.dimensionId)
    .filter((dimensionId) => !unitDimensionIds.has(dimensionId));

  if (invalidDimensionIds.length > 0) {
    throw new Error(
      `Scenario contract referenced unknown dimension id(s): ${[
        ...new Set(invalidDimensionIds),
      ].join(", ")}`,
    );
  }
};

export const validateEvaluationDimensionResults = ({
  scenarioContract,
  dimensionIds,
}: {
  scenarioContract: ScenarioEvaluationContract;
  dimensionIds: readonly string[];
}) => {
  const scenarioDimensionIds = new Set(
    scenarioContract.testedDimensions.map((dimension) => dimension.dimensionId),
  );
  const resultDimensionIds = new Set(dimensionIds);
  const invalidDimensionIds = dimensionIds.filter(
    (dimensionId) => !scenarioDimensionIds.has(dimensionId),
  );
  const missingDimensionIds = scenarioContract.testedDimensions
    .map((dimension) => dimension.dimensionId)
    .filter((dimensionId) => !resultDimensionIds.has(dimensionId));

  if (invalidDimensionIds.length > 0) {
    throw new Error(
      `Evaluation referenced unknown scenario dimension id(s): ${[
        ...new Set(invalidDimensionIds),
      ].join(", ")}`,
    );
  }

  if (missingDimensionIds.length > 0) {
    throw new Error(
      `Evaluation omitted scenario dimension id(s): ${missingDimensionIds.join(
        ", ",
      )}`,
    );
  }
};
