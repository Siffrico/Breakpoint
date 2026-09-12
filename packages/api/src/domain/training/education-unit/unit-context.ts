import type {
  EvaluationDimensionResult,
  UnitContext,
  UnitDifficultySnapshot,
} from "@acme/validators";

import type { Memory } from "../../memory/types";

export type UnitAgentFocus =
  | { readonly kind: "education" }
  | {
      readonly kind: "recall";
      readonly primary: { readonly label: string; readonly content: string };
      readonly companion: {
        readonly label: string;
        readonly content: string;
        readonly relation: string;
      } | null;
    };

const bulletList = (values: readonly string[]) =>
  values.map((value) => `- ${value}`).join("\n");

const targetSection = (context: UnitContext) =>
  `## Unit assignment\nPerformance: ${context.performance}\nTeach and test:\n${bulletList(
    context.targets.map(
      (target) =>
        `${target.skill} — ${target.kind} — ${target.label}: ${target.content}`,
    ),
  )}`;

const workflowSection = (context: UnitContext) =>
  `## Expert workflow\n${context.workflow.name}: ${context.workflow.steps.join(" → ")}`;

const expertiseSection = (context: UnitContext) =>
  `## Expert judgment\n${bulletList(
    context.expertise.expertJudgment.map(
      (entry) => `${entry.rule} When: ${entry.when}`,
    ),
  )}\n\n## Realistic mistakes\n${bulletList(
    context.expertise.commonMistakes.map(
      (entry) =>
        `${entry.mistake} Why it happens: ${entry.whyItHappens} Detection cue: ${entry.detectionCue}`,
    ),
  )}`;

const judgmentSection = (context: UnitContext) =>
  `## Judgment standard\nCriteria:\n${bulletList(
    context.judgment.criteria.map(
      (entry) => `${entry.id} — ${entry.criterion}`,
    ),
  )}\nQuality bar:\n${bulletList(context.judgment.qualityBar)}`;

const testingSection = (context: UnitContext) =>
  `## Test contract\nResponse mode: ${context.testing.responseMode}\nTask types:\n${bulletList(
    context.testing.taskTypes.map(
      (task) =>
        `${task.name}: ${task.situation} Learner does: ${task.learnerDoes}. Output: ${task.output}. Shape: ${task.taskShape}`,
    ),
  )}\nVariation axes:\n${bulletList(
    context.testing.variationAxes.map(
      (axis) => `${axis.name}: ${axis.description}`,
    ),
  )}\nNever do:\n${bulletList(context.testing.neverDo)}`;

const goldilocksSection = (difficulty: UnitDifficultySnapshot) =>
  `## Goldilocks\n${difficulty.promptBlock}`;

const reviewGoldilocksSection = (difficulty: UnitDifficultySnapshot) =>
  `## Goldilocks\n${difficulty.promptBlock
    .split("\n")
    .filter((line) => !line.startsWith("- Support:"))
    .join("\n")}`;

const focusSection = (focus: UnitAgentFocus): string | null =>
  focus.kind === "education"
    ? null
    : `## Recall assignment\nIndependently stress-test retrieval and use of: ${focus.primary.label} — ${focus.primary.content}${
        focus.companion
          ? `\nCompose it with ${focus.companion.label} — ${focus.companion.content} (${focus.companion.relation} relation).`
          : ""
      }\nThis is spaced review, not a fresh lesson.`;

const joinSections = (sections: readonly (string | null)[]) =>
  sections
    .filter((section): section is string => section !== null)
    .join("\n\n");

const challengeSurfaceSummary = (prompt: string): string =>
  prompt
    .split(/\n\s*\n/)
    .find((part) => part.trim().length > 0)
    ?.trim() ?? prompt.trim();

/**
 * What the last failed scenario found. The mentor reads it so a re-teach
 * covers the one idea the learner is missing rather than the whole unit
 * again, and so a repair scenario is built to break that exact idea rather
 * than the label filed next to it.
 */
export interface UnitRepairTarget {
  readonly errorCodes: readonly string[];
  readonly hypothesis: string | null;
  readonly dimensionResults: readonly EvaluationDimensionResult[];
}

const repairSection = (repair: UnitRepairTarget | null): string | null => {
  if (!repair) return null;
  const weak = repair.dimensionResults.filter((result) => result.score < 70);
  return joinSections([
    "## Repair target",
    repair.hypothesis
      ? `The learner was just told: "${repair.hypothesis}"`
      : null,
    repair.errorCodes.length > 0
      ? `Prior error codes: ${repair.errorCodes.join(", ")}`
      : null,
    weak.length > 0
      ? `Weak criteria:\n${bulletList(
          weak.map((result) => `${result.dimensionId}: ${result.missing}`),
        )}`
      : null,
  ]);
};

export const createMentorContext = ({
  unitContext,
  difficulty,
  memories,
  focus,
  repair = null,
}: {
  unitContext: UnitContext;
  difficulty: UnitDifficultySnapshot;
  memories: readonly Memory[];
  focus: UnitAgentFocus;
  repair?: UnitRepairTarget | null;
}): string =>
  joinSections([
    targetSection(unitContext),
    workflowSection(unitContext),
    expertiseSection(unitContext),
    testingSection(unitContext),
    judgmentSection(unitContext),
    goldilocksSection(difficulty),
    repairSection(repair),
    memories.length > 0
      ? `## Learner memory\n${bulletList(memories.map((memory) => memory.content))}`
      : null,
    focusSection(focus),
  ]);

export const createMentorScenarioContext = ({
  unitContext,
  difficulty,
  focus,
  previousChallengePrompts = [],
  repair = null,
}: {
  unitContext: UnitContext;
  difficulty: UnitDifficultySnapshot;
  focus: UnitAgentFocus;
  previousChallengePrompts?: readonly string[];
  repair?: UnitRepairTarget | null;
}): string =>
  joinSections([
    targetSection(unitContext),
    testingSection(unitContext),
    judgmentSection(unitContext),
    reviewGoldilocksSection(difficulty),
    previousChallengePrompts.length > 0
      ? `## Previously used challenge surfaces\nCreate a genuinely fresh surface; do not repeat these prompts:\n${bulletList(previousChallengePrompts.map(challengeSurfaceSummary))}`
      : null,
    repairSection(repair),
    focusSection(focus),
  ]);

export const createCritiqueContext = ({
  unitContext,
  focus,
}: {
  unitContext: UnitContext;
  focus: UnitAgentFocus;
}): string =>
  joinSections([
    targetSection(unitContext),
    workflowSection(unitContext),
    expertiseSection(unitContext),
    judgmentSection(unitContext),
    focusSection(focus),
  ]);
