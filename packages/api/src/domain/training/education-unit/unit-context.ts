import type { Memory } from "../../memory/types";
import type { UnitContent } from "../types/training.types";
import type { EducationExperienceDefinition } from "./experience";
import type { PersistedUnitRun } from "./unit-state";

export interface UnitKnowledgeContext {
  readonly workflow: { readonly name: string; readonly steps: readonly string[] };
  readonly framing: { readonly question: string; readonly part: number } | null;
  readonly checked: readonly { readonly label: string; readonly content: string }[];
  readonly targets: readonly {
    readonly id: string;
    readonly kind: "concept" | "mechanism";
    readonly label: string;
    readonly content: string;
  }[];
}

const bullets = (values: readonly string[]) =>
  values.map((value) => `- ${value}`).join("\n");

export const buildUnitContext = ({
  unit,
  run,
  experience,
  targetIdentity,
  memories,
  knowledge,
  difficultyLine,
}: {
  unit: UnitContent;
  run: PersistedUnitRun;
  experience: EducationExperienceDefinition;
  targetIdentity: string;
  memories: readonly Memory[];
  knowledge: UnitKnowledgeContext | null;
  difficultyLine: string | null;
}): string => {
  if (!unit.unitMasteryContract) {
    throw new Error("The education unit has no capability contract.");
  }
  const dimensionById = new Map(
    unit.unitMasteryContract.dimensions.map((dimension) => [
      dimension.id,
      dimension,
    ]),
  );
  const capabilityTodos = run.capabilityTodos
    .map((todo, index) => {
      const dimension = dimensionById.get(todo.dimensionId);
      if (!dimension) {
        throw new Error(`Unknown persisted capability todo: ${todo.dimensionId}.`);
      }
      return `${index + 1}. [${todo.status === "completed" ? "x" : " "}] ${dimension.name} (${dimension.id})\n   Goal: ${dimension.description}\n   Pass evidence: ${dimension.passSignals.join("; ")}\n   Failure signals: ${dimension.failSignals.join("; ")}\n   Surrogate traps: ${dimension.surrogateTraps.join("; ")}\n   Recorded evidence: ${todo.evidence ?? "None"}`;
    })
    .join("\n");
  const reviewTodoById = new Map(
    experience.reviewer.todos.map((todo) => [todo.id, todo]),
  );
  const reviewTodos = run.reviewTodos
    .map((todo, index) => {
      const definition = reviewTodoById.get(todo.todoId);
      if (!definition) {
        throw new Error(`Unknown persisted review todo: ${todo.todoId}.`);
      }
      return `${index + 1}. [${todo.status === "completed" ? "x" : " "}] ${definition.goal} (${definition.id})\n   Completion evidence: ${definition.completionEvidence.join("; ")}\n   Recorded evidence: ${todo.evidence ?? "None"}`;
    })
    .join("\n");
  const sections = [
    `## Learner destination\n${targetIdentity}`,
    `## Unit\nTitle: ${unit.title}\nLearning goal: ${unit.learningGoal}\nWhy it matters: ${unit.whyItMatters}\nSeed situation: ${unit.seedPrompt}\nPrivate seed hint: ${unit.seedHint}`,
    `## Capability todos\n${capabilityTodos}`,
    `## Reviewer todos\n${reviewTodos}`,
  ];

  if (knowledge) {
    sections.push(
      `## Expert workflow\n${knowledge.workflow.name}: ${knowledge.workflow.steps.join(" → ")}\nAuthored question: ${knowledge.framing?.question ?? "None"}\nAlready demonstrated: ${knowledge.checked.map((entry) => `${entry.label}: ${entry.content}`).join("; ") || "None"}\nThis unit must land:\n${bullets(knowledge.targets.map((entry) => `${entry.id} — ${entry.kind} — ${entry.label}: ${entry.content}`))}`,
    );
  }
  if (difficultyLine) sections.push(`## Goldilocks direction\n${difficultyLine}`);
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
