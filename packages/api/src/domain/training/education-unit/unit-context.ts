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

export type UnitContextAudience = "mentor" | "reviewer";

const bullets = (values: readonly string[]) =>
  values.map((value) => `- ${value}`).join("\n");

const renderDimension = ({
  dimension,
  status,
}: {
  dimension: PersistedUnitRun["masteryContract"]["dimensions"][number];
  status?: "pending" | "completed";
}) =>
  `${status ? `[${status === "completed" ? "x" : " "}] ` : ""}${dimension.name} (${dimension.id})\n   Goal: ${dimension.description}\n   Pass evidence: ${dimension.passSignals.join("; ")}\n   Failure signals: ${dimension.failSignals.join("; ")}\n   Surrogate traps: ${dimension.surrogateTraps.join("; ")}`;

const renderMasteryContract = (run: PersistedUnitRun) =>
  run.masteryContract.dimensions
    .map(
      (dimension, index) => `${index + 1}. ${renderDimension({ dimension })}`,
    )
    .join("\n");

const renderCapabilityProgress = (run: PersistedUnitRun) => {
  const dimensionById = new Map(
    run.masteryContract.dimensions.map((dimension) => [
      dimension.id,
      dimension,
    ]),
  );
  return run.capabilityTodos
    .map((todo, index) => {
      const dimension = dimensionById.get(todo.dimensionId);
      if (!dimension) {
        throw new Error(
          `Unknown persisted capability todo: ${todo.dimensionId}.`,
        );
      }
      return `${index + 1}. ${renderDimension({ dimension, status: todo.status })}`;
    })
    .join("\n");
};

export const buildUnitContext = ({
  audience,
  unit,
  run,
  targetIdentity,
  memories,
  knowledge,
  difficultyLine,
}: {
  audience: UnitContextAudience;
  unit: UnitContent;
  run: PersistedUnitRun;
  targetIdentity: string;
  memories: readonly Memory[];
  knowledge: UnitKnowledgeContext | null;
  difficultyLine: string | null;
}): string => {
  const sections = [
    `## Learner destination\n${targetIdentity}`,
    `## Unit\nTitle: ${unit.title}\nLearning goal: ${unit.learningGoal}\nWhy it matters: ${unit.whyItMatters}\nSeed situation: ${unit.seedPrompt}\nPrivate seed hint: ${unit.seedHint}`,
    audience === "mentor"
      ? `## Capability progress\n${renderCapabilityProgress(run)}`
      : `## Mastery contract\n${renderMasteryContract(run)}`,
  ];

  if (knowledge) {
    sections.push(
      `## Expert workflow\n${knowledge.workflow.name}: ${knowledge.workflow.steps.join(" → ")}\nAuthored question: ${knowledge.framing?.question ?? "None"}\nAlready demonstrated: ${knowledge.checked.map((entry) => `${entry.label}: ${entry.content}`).join("; ") || "None"}\nThis unit must land:\n${bullets(knowledge.targets.map((entry) => `${entry.id} — ${entry.kind} — ${entry.label}: ${entry.content}`))}`,
    );
  }
  if (difficultyLine) {
    sections.push(`## Goldilocks direction\n${difficultyLine}`);
  }
  if (memories.length > 0) {
    sections.push(
      `## Learner context\n${bullets(memories.map((memory) => memory.content))}`,
    );
  }
  if (run.reviewerFeedback) {
    sections.push(`## Latest adversarial finding\n${run.reviewerFeedback}`);
  }
  return sections.join("\n\n");
};
