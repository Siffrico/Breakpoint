import type { UnitContext, UnitDifficultySnapshot } from "@acme/validators";

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

export const createMentorContext = ({
  unitContext,
  difficulty,
  memories,
  focus,
}: {
  unitContext: UnitContext;
  difficulty: UnitDifficultySnapshot;
  memories: readonly Memory[];
  focus: UnitAgentFocus;
}): string =>
  joinSections([
    targetSection(unitContext),
    workflowSection(unitContext),
    expertiseSection(unitContext),
    goldilocksSection(difficulty),
    memories.length > 0
      ? `## Learner memory\n${bulletList(memories.map((memory) => memory.content))}`
      : null,
    focusSection(focus),
  ]);

export const createCritiqueContext = ({
  unitContext,
  difficulty,
  focus,
  mode,
  previousChallengePrompts = [],
}: {
  unitContext: UnitContext;
  difficulty: UnitDifficultySnapshot;
  focus: UnitAgentFocus;
  mode: "create_challenge" | "judge_answer";
  previousChallengePrompts?: readonly string[];
}): string =>
  joinSections([
    targetSection(unitContext),
    workflowSection(unitContext),
    expertiseSection(unitContext),
    mode === "create_challenge" ? testingSection(unitContext) : null,
    judgmentSection(unitContext),
    mode === "create_challenge" ? goldilocksSection(difficulty) : null,
    mode === "create_challenge" && previousChallengePrompts.length > 0
      ? `## Previously used challenge surfaces\nCreate a genuinely fresh surface; do not repeat these prompts:\n${bulletList(previousChallengePrompts)}`
      : null,
    focusSection(focus),
  ]);
