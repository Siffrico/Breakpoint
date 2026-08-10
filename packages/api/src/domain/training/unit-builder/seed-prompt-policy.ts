import type { OutcomeTaskContract, UnitBuilderContext } from "./contracts";

const WHOLE_TASK_SYSTEM = `You are Breakpoint's task-design agent inside the education-unit-builder.

Create one authentic whole task that makes the learner perform, decide, diagnose, or produce work. Exercise the assigned Skill Map targets without naming them or prescribing a solution route.

Quality standard:
- preserve the task form practitioners or test-takers actually encounter
- make the learner do the irreplaceable thinking while the prompt supplies realistic setup and materials
- use ambiguity and interacting constraints for difficulty, never missing information the learner would normally have
- avoid pre-teaching, concept labels, generic reflection, and artificial reconstruction exercises`;

const OUTPUT_RULES = `Output rules:
- scenario.title titles the situation itself, not the lesson
- scenario.focusAreas contains 2 or 3 precise evaluation targets
- seedHint guides the kind of response to give without giving away the answer
- clusterArcFrame positions this slot in the larger sequence without teaching the answer
- complexityBudget is 1, 2, or 3 based on the real reasoning load`;

const mainOutcomePrompt = (context: UnitBuilderContext): string => {
  const contract = context.planContext.clusterContext?.taskContract;
  if (!contract) {
    throw new Error("Main-outcome seed policy requires an outcome contract.");
  }
  const { skillMap, practiceContract } = contract;

  return `Design one whole task for this outcome.

Regime: MAIN OUTCOME — repeated performance against a fixed result.

Fixed result:
${contract.outcomeResult}

Practice Contract:
- Task types:
${formatList(practiceContract.taskTypes.map((task) => `${task.name}: ${task.situation} Learner does: ${task.learnerDoes}. Output: ${task.output}. Shape: ${task.taskShape}. Exercises: ${task.skills.join(", ")}`))}
- Quality bar:
${formatList(practiceContract.qualityBar)}
- Variation axes:
${formatList(practiceContract.variationAxes.map((axis) => `${axis.name}: ${axis.description}`))}
- Evaluation criteria:
${formatList(practiceContract.evaluationCriteria.map((criterion) => `${criterion.criterion} Measures: ${criterion.skills.join(", ")}`))}
- Never do:
${formatList(practiceContract.neverDo)}

Skill Map:
- Skills and knowledge:
${formatList(skillMap.skills.map((skill) => `${skill.name}: ${skill.description}. ${skill.items.map((item) => `${item.name}: ${item.description}`).join(" ")}`))}
- Expert judgment:
${formatList(skillMap.expertJudgment.map((item) => `${item.rule} When: ${item.when}`))}
- Common mistakes:
${formatList(skillMap.commonMistakes.map((item) => `${item.mistake}. Why: ${item.whyItHappens}. Detection cue: ${item.detectionCue}`))}
${formatBandBrief(practiceContract, context.difficulty?.bandOrder)}

Rules:
- title is a task-worded directive naming the concrete task, never a question
- seedPrompt must be the complete learner-ready task in the required task shape, including all stimuli, options, inputs, or constraints needed to attempt it
- the learner is judged only against the fixed result; do not add a second deliverable
- selected-response task shapes must include the complete response options and satisfy the quality bar
- use the current Skill Map targets to choose this repetition's content and variation, but never name those targets or prescribe the solve procedure
- make the learner apply an expert heuristic; do not reward recall of a fact alone
- build the task at the band the difficulty directive names, to the band brief's stated reasoning path, withheld givens, and embedded alternatives — those counts are the difficulty, not a suggestion
- treat checked Skill Map items as assumed-known
- every quality-bar item, evaluation criterion, and never-do constraint is mandatory
- do not create a pre-teach diagnostic, reduce the task to one mechanism or one failure, or append "Reconstruct the system" questions

${OUTPUT_RULES}

Context:
${formatUnitBuilderContext(context)}`;
};

export const buildSeedStageRequest = (context: UnitBuilderContext) => {
  if (context.planContext.regime !== "main_outcome") {
    throw new Error("Unit generation requires an outcome curriculum.");
  }
  return { system: WHOLE_TASK_SYSTEM, prompt: mainOutcomePrompt(context) };
};

const formatList = (values: readonly string[]): string =>
  values.map((value) => `  - ${value}`).join("\n");

/**
 * The band the engine chose, spelled out in this outcome's own terms.
 *
 * Falls back to the whole ladder when no directive resolved, so the generator
 * still sees the escalation it is working inside rather than guessing at
 * "harder" from the slot number alone.
 */
const formatBandBrief = (
  practiceContract: OutcomeTaskContract["practiceContract"],
  bandOrder: number | undefined,
): string => {
  const bandBriefs = practiceContract.difficultyBands;
  const chosen = bandBriefs.find((brief) => brief.band === bandOrder);
  const render = (brief: (typeof bandBriefs)[number]) =>
    `  - Band ${brief.band}: ${brief.task}
    Reasoning: ${brief.reasoning}
    Support: ${brief.support}
    Traps: ${brief.traps.join("; ") || "None"}`;

  return chosen
    ? `- Band brief for THIS task — build to it exactly:\n${render(chosen)}`
    : `- No band was resolved for this task. Build at band 1 and treat the ladder as context:\n${bandBriefs.map(render).join("\n")}`;
};

const formatUnitBuilderContext = (context: UnitBuilderContext): string => {
  const clusterContext = context.planContext.clusterContext
    ? `${context.planContext.clusterContext.title}: ${context.planContext.clusterContext.summary} | Why it matters: ${context.planContext.clusterContext.whyItMatters}`
    : "None";
  const priorLearning =
    context.learner.priorLearning.length > 0
      ? context.learner.priorLearning
          .map(
            (attempt, index) =>
              `${index + 1}. ${attempt.title} | score=${attempt.score} | readiness=${attempt.readiness} | improvements=${attempt.improvements.join("; ") || "None"} | failures=${attempt.failureTags.join("; ") || "None"} | next=${attempt.nextStep}`,
          )
          .join("\n")
      : "No prior learning recorded.";

  return `Node kind: ${context.node.kind}
Unit regime: ${context.planContext.regime ?? "missing"}
Node title: ${context.node.title}
Node summary: ${context.node.summary}
Why it matters: ${context.node.whyItMatters}
Slot position: ${context.planContext.slotIndex} of ${context.planContext.totalSlots}
Cluster context: ${clusterContext}
Target identity: ${context.learner.targetIdentity}
Prior learning:
${priorLearning}
${context.difficulty?.promptBlock ?? "No difficulty directive resolved for this unit; build at the middle band."}
${
  context.knowledge
    ? `Workflow: ${context.knowledge.workflow.name}
Workflow spine: ${context.knowledge.workflow.steps.join(" -> ")}
Authored question: ${context.knowledge.framing?.question ?? "None"}
Already checked (assume known): ${context.knowledge.checked.map((entry) => `${entry.label}: ${entry.content}`).join("; ") || "None"}
This unit must exercise: ${context.knowledge.targets.map((entry) => `${entry.skill} — ${entry.kind} — ${entry.label}: ${entry.content}`).join("; ")}`
    : "No knowledge targets are attached."
}`;
};
