import type { UnitBuilderContext } from "./contracts";

const FOUNDATION_SYSTEM = `You are Breakpoint's seed-stage agent inside the education-unit-builder.

You decide what this exact unit should teach before the learner sees any instructional content.

Your job:
- choose the next necessary concept for this unit slot
- name the misconception or collapse pattern the learner is likely bringing in
- create a pre-teach scenario prompt that exposes the learner's current model through action or judgment
- define what proof of understanding will matter later
- frame the scenario so later evaluation can detect real transfer

Quality standard:
- this should feel like a precise coaching diagnosis, not a generic course lesson
- choose a failure-sized high-leverage concept: focused enough to explain the likely failure, complete enough to transfer
- use the learner's target identity and prior failures to decide what matters now
- avoid filler, vague abstractions, and fake difficulty`;

const WHOLE_TASK_SYSTEM = `You are Breakpoint's task-design agent inside the education-unit-builder.

You create one authentic whole task that makes the learner perform, decide, diagnose, or produce work. The task must exercise the assigned syllabus targets without naming them or prescribing a solution route.

Quality standard:
- preserve the task form practitioners or test-takers actually encounter
- make the learner do the irreplaceable thinking while the prompt supplies realistic setup and materials
- use ambiguity and interacting constraints for difficulty, never missing information the learner would normally have
- avoid pre-teaching, concept labels, generic reflection, and artificial reconstruction exercises`;

const DERIVED_QUESTION_RULES = `- Title the unit as the single practitioner question this unit answers. It must be second-person, end in "?", and concern doing the work rather than defining a term.
- Default to "How do you ...?". Use "When ...?" or "Which ...?" for discriminations and "Why ...?" for mechanisms.
- Never use a tutorial heading or definitional question.`;

const OUTPUT_RULES = `Output rules:
- scenario.title titles the situation itself, not the lesson
- scenario.focusAreas contains 2 or 3 precise evaluation targets
- seedHint guides the kind of response to give without giving away the answer
- clusterArcFrame positions this slot in the larger sequence without teaching the answer
- complexityBudget is 1, 2, or 3 based on the real reasoning load
- unitMasteryContract contains 2 to 4 autonomous, observable capability dimensions covering every target syllabus item and the unit's workflow judgment
- passSignals describe observable reasoning or action, failSignals describe concrete breakdowns, and surrogateTraps catch fluent imitation without understanding
- conceptTarget identifies the concrete capability being exercised, misconceptionTarget identifies the likely failure, and workedExampleBrief tells the later Build stage what contrasting example would unlock improvement`;

const foundationPrompt = (context: UnitBuilderContext): string => {
  const framing = context.knowledge?.framing ?? null;
  const titleRule = framing
    ? `${framing.question}${framing.part > 1 ? ` — Part ${framing.part}` : ""}`
    : `derive one practitioner question from the targets. ${DERIVED_QUESTION_RULES}`;

  return `Design the Seed stage for this foundation education unit.

Regime: FOUNDATION — framed reasoning.
This unit answers exactly one authored practitioner question. The learner may see the question but must not be handed its answer.

Rules:
- title: ${titleRule}
- Build seedPrompt as one concrete situation that makes exactly that question urgent.
- seedPrompt must expose the learner's current model using only prior knowledge; it must not teach or name the target concept.
- Show one mentally simulatable mechanism, one dominant failure, and no irrelevant detail.
- The situation must be one invention away: exactly one new mechanism should resolve its pressure.
- End with "### Reconstruct the system" and exactly three numbered questions covering the goal, current mechanism, and why it fails under the pressure.
- Force every target knowledge item through the scenario. Treat checked items as assumed-known.
- Foundation units should usually use complexityBudget 1 or 2.

${OUTPUT_RULES}

Context:
${formatUnitBuilderContext(context)}`;
};

const skillsetPrompt = (
  context: UnitBuilderContext,
): string => `Design one whole-task Skillset unit.

Regime: SKILLSET — unframed whole-task.
The learner has local competence and must decide which knowledge and methods matter inside one realistic task.

Rules:
- title is a task-worded directive naming the realistic whole task, never a question
- seedPrompt gives one concrete initial state, one desired end state, and no prescribed route
- name no concepts, skills, or framing questions in learner-visible text
- force every target knowledge item through the task while treating checked items as assumed-known
- do not turn the task into a pre-teach diagnostic or append generic reconstruction questions

${OUTPUT_RULES}

Context:
${formatUnitBuilderContext(context)}`;

const mainOutcomePrompt = (context: UnitBuilderContext): string => {
  const contract = context.planContext.clusterContext?.taskContract;
  if (!contract) {
    throw new Error("Main-outcome seed policy requires a topic task contract.");
  }
  const { scenarioBrief } = contract;

  return `Design one whole task for this outcome.

Regime: MAIN OUTCOME — repeated performance against a fixed demand.

Fixed demand:
${contract.mainOutcome}

Task-generation contract:
- Task shape: ${scenarioBrief.taskShape}
- Quality bar:
${formatList(scenarioBrief.qualityBar)}
- Legitimate variation axes:
${formatList(scenarioBrief.variationAxes)}
- Never do:
${formatList(scenarioBrief.neverDo)}

Rules:
- title is a task-worded directive naming the concrete task, never a question
- seedPrompt must be the complete learner-ready task in the required task shape, including all stimuli, options, inputs, or constraints needed to attempt it
- the learner is judged only against the fixed demand; do not add a second deliverable
- selected-response task shapes must include the complete response options and satisfy the quality bar
- use the current syllabus targets to choose this repetition's content and variation, but never name those targets or prescribe the solve procedure
- treat checked syllabus items as assumed-known
- every quality-bar item and every never-do constraint is mandatory
- do not create a pre-teach diagnostic, reduce the task to one mechanism or one failure, or append "Reconstruct the system" questions

${OUTPUT_RULES}

Context:
${formatUnitBuilderContext(context)}`;
};

const legacyPrompt = (
  context: UnitBuilderContext,
): string => `Design the Seed stage for this education unit.

Regime: LEGACY.
- title names the real lesson this unit teaches
- seedPrompt is a concrete situation that probes prior understanding without teaching the answer
- stay within the current slot's scope

${OUTPUT_RULES}

Context:
${formatUnitBuilderContext(context)}`;

export const buildSeedStageRequest = (context: UnitBuilderContext) => {
  const regime = context.planContext.regime;
  switch (regime) {
    case "foundation":
      return { system: FOUNDATION_SYSTEM, prompt: foundationPrompt(context) };
    case "skillset":
      return { system: WHOLE_TASK_SYSTEM, prompt: skillsetPrompt(context) };
    case "main_outcome":
      return { system: WHOLE_TASK_SYSTEM, prompt: mainOutcomePrompt(context) };
    case null:
      return { system: FOUNDATION_SYSTEM, prompt: legacyPrompt(context) };
  }
};

const formatList = (values: readonly string[]): string =>
  values.map((value) => `  - ${value}`).join("\n");

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
Unit regime: ${context.planContext.regime ?? "foundation"}
Node title: ${context.node.title}
Node summary: ${context.node.summary}
Why it matters: ${context.node.whyItMatters}
Slot position: ${context.planContext.slotIndex} of ${context.planContext.totalSlots}
Cluster context: ${clusterContext}
Target identity: ${context.learner.targetIdentity}
Prior learning:
${priorLearning}
${
  context.knowledge
    ? `Workflow: ${context.knowledge.workflow.name}
Workflow spine: ${context.knowledge.workflow.steps.join(" -> ")}
Authored question: ${context.knowledge.framing?.question ?? "None"}
Already checked (assume known): ${context.knowledge.checked.map((entry) => `${entry.label}: ${entry.content}`).join("; ") || "None"}
This unit must exercise: ${context.knowledge.targets.map((entry) => `${entry.kind} — ${entry.label}: ${entry.content}`).join("; ")}`
    : "No knowledge targets are attached."
}`;
};
