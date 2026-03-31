import { runAgent } from "../orchestration/agent-runtime";
import {
  SeedStageOutputSchema,
  UnitBuilderContextSchema,
  type SeedStageOutput,
  type UnitBuilderContext,
} from "./contracts";

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
- choose the smallest high-leverage concept, not broad topic coverage
- use the learner's target identity and prior failures to decide what matters now
- avoid filler, vague abstractions, and fake difficulty
- build something that will create strong downstream Build, Prove, and Repair stages

Output discipline:
- the title must name the real lesson
- the seedPrompt must be a concrete situation in the learner's world that contains the concept without naming it
- the seedPrompt must not ask them to define the lesson, summarize what they believe, or explain a term in the abstract
- the seedPrompt must be solvable using only what the learner already knows before this session
- the seedHint must guide the kind of response to give in the situation without leaking the concept
- the clusterArcFrame must position this slot inside the larger sequence in 1 or 2 sentences
- the clusterArcFrame must explain what earlier slots establish and what this slot changes, complicates, or synthesizes
- the complexityBudget must be 1, 2, or 3 based on the true teaching load of this concept
- prefer 1 for foundational concepts unless the mechanism is genuinely dense; use 3 only when the concept needs extended reasoning, edge cases, or formal structure
- the conceptTarget, misconceptionTarget, and proofTargets must be concrete enough for later agents to use directly`;

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
- Stay within the current slot's scope.
- Earlier slots should build leverage. Later slots should stress transfer and edge cases.
- If this is an integration slot, synthesize across completed clusters rather than teaching an isolated micro-skill.
- seedPrompt is the Scenario step in SACTRE, not a practice prompt and not a definition question.
- seedPrompt must place the learner inside a concrete situation where they must judge, choose, diagnose, or explain what is happening using only prior knowledge.
- seedPrompt must contain no new teaching, no concept naming, and no wording like "what do you think this concept means?"
- seedPrompt should feel like a plausible situation from the learner's world, not a textbook exercise.
- seedHint may tell them what kind of move to make in the situation, but must not give away the concept.
- scenario.title should title the situation itself, not the lesson.
- scenario.focusAreas should contain 2 or 3 precise evaluation targets.
- proofTargets should name what later stages must verify.
- workedExampleBrief should tell the Build stage what kind of example would best unlock the concept.
- clusterArcFrame must not answer the seed prompt or teach the lesson content.
- complexityBudget 1 = foundational, 2 = intermediate, 3 = advanced.
- Earlier non-integration slots should usually stay at 1 or 2 unless there is a clear reason the concept is inherently dense.

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
Node title: ${context.node.title}
Node summary: ${context.node.summary}
Why it matters: ${context.node.whyItMatters}
Slot position: ${context.planContext.slotIndex} of ${context.planContext.totalSlots}
Cluster context: ${clusterContext}
Completed clusters for integration: ${integrationContext}
Target identity: ${context.learner.targetIdentity}
Prior learning:
${priorLearning}`;
};
