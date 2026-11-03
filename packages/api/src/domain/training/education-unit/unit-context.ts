import type {
  UnitContext,
  UnitDifficultySnapshot,
  UnitStep,
} from "@acme/validators";

import type { Memory } from "../../memory/types";
import type { UnitRoundStep } from "./unit-policy";
import { findLastRound, isRoundStep } from "./unit-policy";
import { partLetter } from "./unit-state";

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

const joinSections = (sections: readonly (string | null)[]) =>
  sections
    .filter((section): section is string => section !== null)
    .join("\n\n");

const findLastLesson = (steps: readonly UnitStep[]) =>
  [...steps]
    .reverse()
    .find(
      (step): step is Extract<UnitStep, { kind: "teach" }> =>
        step.kind === "teach",
    ) ?? null;

/** The lesson the learner was given and how they explained it back. */
const lessonSection = (steps: readonly UnitStep[]): string | null => {
  const lesson = findLastLesson(steps);
  if (!lesson) return null;
  return joinSections([
    `## The lesson the learner was given\n${lesson.lesson}`,
    lesson.explanation
      ? `## The learner's explain-back\n${lesson.explanation}`
      : null,
  ]);
};

const partHistory = (round: UnitRoundStep): string | null => {
  const graded = round.parts.filter((part) => part.result);
  if (graded.length === 0) return null;
  return `Earlier parts of this round:\n${bulletList(
    graded.map((part, index) =>
      part.result?.met
        ? `(${partLetter(index)}) met — ${part.question}`
        : `(${partLetter(index)}) missed — ${part.question}\n  Suspected idea: ${part.result?.hypothesis ?? "not stated"}`,
    ),
  )}`;
};

const activeRoundSection = (round: UnitRoundStep | null): string | null =>
  round
    ? joinSections([
        `## The round in progress (${round.spec.label})\nShared situation:\n${round.narrative}`,
        partHistory(round),
      ])
    : null;

const usedNarrativesSection = (steps: readonly UnitStep[]): string | null => {
  const narratives = steps
    .filter(isRoundStep)
    .map((round) => round.narrative.split(/\n\s*\n/)[0]?.trim() ?? "")
    .filter(Boolean);
  return narratives.length > 0
    ? `## Situations already used\nA new round needs a genuinely fresh situation; do not reuse these:\n${bulletList(narratives)}`
    : null;
};

/**
 * What the latest graded parts found. The mentor reads it so a re-teach covers
 * the one idea the learner is missing, and so the next part is built to test
 * that exact idea rather than the label filed next to it.
 */
const repairSection = (steps: readonly UnitStep[]): string | null => {
  const round = findLastRound(steps);
  const missed =
    round?.parts.filter((part) => part.result && !part.result.met) ?? [];
  if (missed.length === 0) return null;
  return `## Repair target\n${bulletList(
    missed.map((part) =>
      joinSections([
        `Suspected idea: ${part.result?.hypothesis ?? "not stated"}`,
        part.result?.errorCodes.length
          ? `Error codes: ${part.result.errorCodes.join(", ")}`
          : null,
        `Weak criteria: ${
          part.result?.criterionResults
            .filter((result) => !result.met)
            .map((result) => `${result.dimensionId}: ${result.missing ?? "not shown"}`)
            .join("; ") ?? ""
        }`,
      ]),
    ),
  )}`;
};

export const createMentorContext = ({
  unitContext,
  difficulty,
  memories,
  steps = [],
}: {
  unitContext: UnitContext;
  difficulty: UnitDifficultySnapshot;
  memories: readonly Memory[];
  steps?: readonly UnitStep[];
}): string =>
  joinSections([
    targetSection(unitContext),
    workflowSection(unitContext),
    expertiseSection(unitContext),
    testingSection(unitContext),
    judgmentSection(unitContext),
    goldilocksSection(difficulty),
    repairSection(steps),
    memories.length > 0
      ? `## Learner memory\n${bulletList(memories.map((memory) => memory.content))}`
      : null,
  ]);

export const createPartsContext = ({
  unitContext,
  difficulty,
  steps,
  opensRound,
}: {
  unitContext: UnitContext;
  difficulty: UnitDifficultySnapshot;
  steps: readonly UnitStep[];
  opensRound: boolean;
}): string =>
  joinSections([
    targetSection(unitContext),
    testingSection(unitContext),
    judgmentSection(unitContext),
    reviewGoldilocksSection(difficulty),
    lessonSection(steps),
    opensRound ? usedNarrativesSection(steps) : null,
    opensRound ? null : activeRoundSection(findLastRound(steps)),
    repairSection(steps),
  ]);

export const createGradingContext = ({
  unitContext,
  steps,
}: {
  unitContext: UnitContext;
  steps: readonly UnitStep[];
}): string =>
  joinSections([
    targetSection(unitContext),
    workflowSection(unitContext),
    expertiseSection(unitContext),
    judgmentSection(unitContext),
    lessonSection(steps),
    activeRoundSection(findLastRound(steps)),
  ]);
