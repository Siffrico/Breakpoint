import type { SeedStageOutput, UnitBuilderContext } from "./contracts";
import { runAgent } from "../orchestration/agent-runtime";
import { SeedStageOutputSchema, UnitBuilderContextSchema } from "./contracts";

const SEED_STAGE_SYSTEM = `You are Breakpoint's seed-stage agent inside the education-unit-builder.

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
- avoid filler, vague abstractions, and fake difficulty
- build something that will create strong downstream Build, Prove, and Repair stages

Output discipline:
- the title must follow the title rule that opens the task prompt's Rules list; that rule is regime-specific and overrides any general instinct about how to name a lesson
- the seedPrompt must be a concrete situation in the learner's world that contains the concept without naming it
- the seedPrompt must not ask them to define the lesson, summarize what they believe, or explain a term in the abstract
- the seedPrompt must be solvable using only what the learner already knows before this session
- the seedPrompt must show one mentally simulatable mechanism, one dominant failure, and no detail that does not cause that failure
- the seedPrompt must be one invention away: exactly one new mechanism should resolve its pressure
- the seedPrompt must use readable Markdown and end with exactly three concrete questions covering goal, current mechanism, and why it fails under the one pressure
- the seedHint must guide the kind of response to give in the situation without leaking the concept
- the clusterArcFrame must position this slot inside the larger sequence in 1 or 2 sentences
- the clusterArcFrame must explain what earlier slots establish and what this slot changes, complicates, or synthesizes
- the complexityBudget must be 1, 2, or 3 based on the true teaching load of this concept
- prefer 1 for foundational concepts unless the mechanism is genuinely dense; use 3 only when the concept needs extended reasoning, edge cases, or formal structure
- the conceptTarget, misconceptionTarget, and proofTargets must be concrete enough for later agents to use directly`;

const titleNamingRule = (
  regime: UnitBuilderContext["planContext"]["regime"],
): string => {
  switch (regime) {
    case "foundation":
      return `- Title the unit as the single practitioner question this unit answers. The title is what the learner is answering by the end, so it must be a genuine question: second-person, ending in "?", and about doing the work rather than about a term.
  - Default to "How do you ...?" — e.g. "How do you map an existing signup flow?"
  - Use "When ...?" or "Which ...?" when the targets are discriminations, so the judgment call stays visible — e.g. "When is it safe to retry a write?" Collapsing that into "How do you retry safely?" blurs the exact distinction the unit exists to sharpen.
  - Use "Why ...?" when the target is a mechanism the learner must be able to explain — e.g. "Why does adding steps sometimes reduce friction?"
  - Never write a tutorial heading such as "How to map user flows". That is a course label, not a question the learner answers.
  - Never write a definitional question such as "What is idempotency?". It names the concept and asks for recall instead of performance, which contradicts the no-concept-naming rules below.
  - Choose the form that states this unit's targets most precisely. Do not bend a target into "How do you ...?" to match the default; a precise "When ...?" beats a generic "How do you handle ...?".`;
    case "skillset":
      return `- Title the unit as a task-worded directive naming the realistic whole-task the learner performs (e.g. "Modify this checkout flow to be frictionless"). Never phrase it as a question.`;
    case null:
      return `- The title must name the real lesson.`;
  }
};

export const runSeedStage = async (
  context: UnitBuilderContext,
): Promise<SeedStageOutput> => {
  UnitBuilderContextSchema.parse(context);

  return runAgent({
    agent: "buildContent",
    system: SEED_STAGE_SYSTEM,
    schema: SeedStageOutputSchema,
    errorMessage: "Failed to generate the seed stage.",
    prompt: `Design the Seed stage for this education unit.

Rules:
${titleNamingRule(context.planContext.regime)}
- Stay within the current slot's scope.
- Earlier slots should build leverage. Later slots should stress transfer and edge cases.
- If this is an integration slot, synthesize across completed clusters rather than teaching an isolated micro-skill.
- seedPrompt is the Scenario step in SACTRE, not a practice prompt and not a definition question.
- seedPrompt must place the learner inside a concrete situation where they must judge, choose, diagnose, or explain what is happening using only prior knowledge.
- seedPrompt must contain no new teaching, no concept naming, and no wording like "what do you think this concept means?"
- seedPrompt should feel like a plausible situation from the learner's world, not a textbook exercise.
- Format seedPrompt with a short title, short paragraphs, bullets, and blank lines. Show one visible pipeline, one changing mechanism, and one dominant failure; remove every irrelevant noun, metric, consequence, and constraint. Require no unstated domain knowledge.
- End with "### Reconstruct the system" and exactly three scenario-specific numbered questions: what the person or system wants, how its visible mechanism works, and why that mechanism fails under the one pressure. Add no hints or extra questions.
- seedHint may tell them what kind of move to make in the situation, but must not give away the concept.
- scenario.title should title the situation itself, not the lesson.
- scenario.focusAreas should contain 2 or 3 precise evaluation targets.
- proofTargets should name what later stages must verify.
- workedExampleBrief should tell the Build stage what kind of example would best unlock the concept.
- clusterArcFrame must not answer the seed prompt or teach the lesson content.
- complexityBudget 1 = foundational, 2 = intermediate, 3 = advanced.
- Earlier non-integration slots should usually stay at 1 or 2 unless there is a clear reason the concept is inherently dense.
- Force the unit's target syllabus entries through the scenario; they are the non-negotiable discriminations for this unit.
- Treat checked syllabus entries as assumed-known. Do not re-teach them except where they are load-bearing context.

Context:
${formatUnitBuilderContext(context)}`,
  });
};

const formatUnitBuilderContext = (context: UnitBuilderContext): string => {
  const clusterContext = context.planContext.clusterContext
    ? `${context.planContext.clusterContext.title}: ${context.planContext.clusterContext.summary} | Why it matters: ${context.planContext.clusterContext.whyItMatters}`
    : "None";
  const integrationContext = context.planContext.integrationContext
    ? context.planContext.integrationContext.completedClusterTitles.join(", ")
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
Unit regime: ${context.planContext.regime ?? "legacy"}
Node title: ${context.node.title}
Node summary: ${context.node.summary}
Why it matters: ${context.node.whyItMatters}
Slot position: ${context.planContext.slotIndex} of ${context.planContext.totalSlots}
Cluster context: ${clusterContext}
Completed clusters for integration: ${integrationContext}
Target identity: ${context.learner.targetIdentity}
Prior learning:
${priorLearning}
${
  context.syllabus
    ? `Workflow: ${context.syllabus.workflow.name}
Workflow spine: ${context.syllabus.workflow.steps.join(" -> ")}
Already checked (assume known): ${context.syllabus.checked.map((entry) => `${entry.label}: ${entry.gloss}`).join("; ") || "None"}
This unit must land: ${context.syllabus.targets.map((entry) => `${entry.label}: ${entry.gloss}`).join("; ")}`
    : "Legacy curriculum: follow the node learning goal and sequence context; no syllabus frontier is attached."
}`;
};
