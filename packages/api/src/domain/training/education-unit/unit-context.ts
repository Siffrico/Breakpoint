import type { Memory } from "../../memory/types";
import type { UnitContent } from "../types/training.types";
import type { PersistedUnitRun } from "./unit-state";

export interface UnitKnowledgeContext {
  readonly workflow: {
    readonly name: string;
    readonly steps: readonly string[];
  };
  readonly framing: { readonly question: string; readonly part: number } | null;
  readonly checked: readonly {
    readonly label: string;
    readonly content: string;
  }[];
  readonly targets: readonly {
    readonly id: string;
    readonly kind: "concept" | "mechanism";
    readonly label: string;
    readonly content: string;
  }[];
}

export interface UnitContextInput {
  readonly unit: UnitContent;
  readonly run: PersistedUnitRun;
  readonly targetIdentity: string;
  readonly memories: readonly Memory[];
  readonly knowledge: UnitKnowledgeContext | null;
  readonly difficultyDirection: string | null;
}

type Capability = PersistedUnitRun["masteryContract"]["dimensions"][number];

const bulletList = (values: readonly string[]) =>
  values.map((value) => `- ${value}`).join("\n");

const numberedList = (entries: readonly string[]) =>
  entries.map((entry, index) => `${index + 1}. ${entry}`).join("\n");

const joinSections = (sections: readonly (string | null)[]) =>
  sections.filter((section): section is string => section !== null).join("\n\n");

const renderCapability = (capability: Capability) =>
  `${capability.name} (${capability.id})
   Goal: ${capability.description}
   Pass evidence: ${capability.passSignals.join("; ")}
   Failure signals: ${capability.failSignals.join("; ")}
   Surrogate traps: ${capability.surrogateTraps.join("; ")}`;

/** Reviewer view: the contract itself, with no trace of how the mentor got here. */
const renderMasteryContract = (run: PersistedUnitRun) =>
  numberedList(run.masteryContract.dimensions.map(renderCapability));

/** Mentor view: the same capabilities as a live checklist. */
const renderCapabilityProgress = (run: PersistedUnitRun) => {
  const capabilityById = new Map(
    run.masteryContract.dimensions.map((capability) => [
      capability.id,
      capability,
    ]),
  );
  return numberedList(
    run.todos.flatMap((todo) => {
      if (todo.kind !== "capability") return [];
      const capability = capabilityById.get(todo.dimensionId);
      if (!capability) {
        throw new Error(
          `Unknown persisted capability todo: ${todo.dimensionId}.`,
        );
      }
      const checkbox = todo.status === "completed" ? "[x]" : "[ ]";
      return [`${checkbox} ${renderCapability(capability)}`];
    }),
  );
};

const destinationSection = (targetIdentity: string) =>
  `## Learner destination\n${targetIdentity}`;

const unitSection = (unit: UnitContent, includeSeedHint: boolean) =>
  `## Unit\nTitle: ${unit.title}\nLearning goal: ${unit.learningGoal}\nWhy it matters: ${unit.whyItMatters}\nSeed situation: ${unit.seedPrompt}${
    includeSeedHint ? `\nPrivate seed hint: ${unit.seedHint}` : ""
  }`;

const expertWorkflowSection = (knowledge: UnitKnowledgeContext) =>
  `## Expert workflow\n${knowledge.workflow.name}: ${knowledge.workflow.steps.join(" → ")}`;

const knowledgeSection = (knowledge: UnitKnowledgeContext) =>
  `${expertWorkflowSection(knowledge)}\nAuthored question: ${knowledge.framing?.question ?? "None"}\nAlready demonstrated: ${knowledge.checked.map((entry) => `${entry.label}: ${entry.content}`).join("; ") || "None"}\nThis unit must land:\n${bulletList(knowledge.targets.map((entry) => `${entry.id} — ${entry.kind} — ${entry.label}: ${entry.content}`))}`;

const goldilocksSection = (difficultyDirection: string) =>
  `## Goldilocks direction\n${difficultyDirection}`;

const memoriesSection = (memories: readonly Memory[]) =>
  `## Learner context\n${bulletList(memories.map((memory) => memory.content))}`;

const priorFindingSection = (run: PersistedUnitRun) =>
  run.reviewPass > 1 && run.reviewerFeedback
    ? `## Earlier repair\n${run.reviewerFeedback}`
    : null;

/**
 * The mentor never sees adversarial findings: reviewer feedback is only ever
 * written in review mode, which the run never leaves back into learning.
 */
export const buildMentorContext = (input: UnitContextInput): string =>
  joinSections([
    destinationSection(input.targetIdentity),
    unitSection(input.unit, true),
    `## Capability progress\n${renderCapabilityProgress(input.run)}`,
    input.knowledge ? knowledgeSection(input.knowledge) : null,
    input.difficultyDirection
      ? goldilocksSection(input.difficultyDirection)
      : null,
    input.memories.length > 0 ? memoriesSection(input.memories) : null,
  ]);

/**
 * Authoring a challenge needs the unit, the contract it must test, and the
 * calibrated difficulty. It does not need the mentor's private seed hint (that
 * is an answer key) or the learner's memories (a scenario tuned to what the
 * learner already told us is a scenario they have already half-solved).
 */
export const buildPresenterContext = (input: UnitContextInput): string =>
  joinSections([
    destinationSection(input.targetIdentity),
    unitSection(input.unit, false),
    `## Mastery contract\n${renderMasteryContract(input.run)}`,
    input.knowledge ? knowledgeSection(input.knowledge) : null,
    input.difficultyDirection
      ? goldilocksSection(input.difficultyDirection)
      : null,
    priorFindingSection(input.run),
  ]);

/**
 * The critic's window, deliberately narrow: the rubric it grades against and
 * the expert path it compares the learner to, and nothing else. No seed hint,
 * no memories, no Goldilocks direction — a grader that knows the intended
 * answer, the learner's history, or the difficulty it was aiming for is
 * grading something other than the answer in front of it.
 */
export const buildCritiqueContext = (input: UnitContextInput): string =>
  joinSections([
    `## Mastery contract\n${renderMasteryContract(input.run)}`,
    input.knowledge ? expertWorkflowSection(input.knowledge) : null,
    priorFindingSection(input.run),
  ]);
