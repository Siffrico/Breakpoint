import {
  PostSeedUnitContentDraftSchema,
  PreSeedUnitContentDraftSchema,
} from "@acme/validators";

import {
  type BuildContentAgentInput,
  BuildContentAgentInputSchema,
} from "./contracts";
import { runAgent } from "../orchestration/agent-runtime";

const BUILD_CONTENT_SYSTEM = `You are Breakpoint's build-content agent.

You design unit experiences that make learners think, fail, rebuild, and transfer.

You are responsible for:
- choosing the exact lesson angle for the unit slot
- creating a sharp seed prompt
- designing a meaningful teach-back ladder
- writing the lesson itself after the learner commits a seed response
- generating practice that exposes whether the concept really transferred

Quality rules:
- Avoid generic educational copy.
- Avoid textbook structure and passive explanation.
- Use pressure, contrast, mechanism, and transfer.
- Every output should make vague learner answers obviously fail.
- The teach-back ladder must escalate in sophistication across 3 rounds.
- The lesson must challenge the learner's current model without humiliating them.`;

export const generatePreSeedUnit = async (
  input: BuildContentAgentInput,
) => {
  BuildContentAgentInputSchema.parse(input);

  return runAgent({
    agent: "buildContent",
    system: BUILD_CONTENT_SYSTEM,
    schema: PreSeedUnitContentDraftSchema,
    errorMessage: "Failed to generate the next unit setup.",
    prompt: `Generate the pre-seed unit scaffold.

Requirements:
- Choose the exact lesson this slot should cover now.
- title must be concrete.
- seedPrompt must force the learner to reveal their current model.
- seedHint should guide without teaching the answer.
- scenario.focusAreas must contain 2 or 3 concrete evaluation targets.
- teachbackSetup.studentPersona should feel like a real skeptical peer.
- teachbackSetup.openingMisconception must be the kind of wrong-but-plausible view a smart learner might hold.
- teachbackSetup.roundLadder must escalate: surface misconception, structural challenge, edge-case stress test.
- passSignals must name what strong understanding would look like.
- failureModes must name how learners usually fake understanding here.

Context:
${formatBuildInput(input)}`,
  });
};

export const generatePostSeedLesson = async (
  input: BuildContentAgentInput,
) => {
  BuildContentAgentInputSchema.parse(input);

  if (!input.learner.seedResponse?.trim()) {
    throw new Error("Seed response is required before build content can be generated.");
  }

  return runAgent({
    agent: "buildContent",
    system: BUILD_CONTENT_SYSTEM,
    schema: PostSeedUnitContentDraftSchema,
    errorMessage: "Failed to generate build content.",
    prompt: `Generate the post-seed lesson package.

Requirements for buildContent:
- Open by using something specific from the learner's seed response.
- Structure the argument as: disrupt, rebuild, ground, land.
- Continuous prose only. No lists. No headings.
- Tone: sharp, respectful, demanding.
- Show why their current model breaks.
- End with exactly one transferable principle sentence.

Requirements for practicePrompts:
- Return exactly 3 prompts.
- Order: identification, construction, debugging.
- Make weak answers fail obviously.
- The debugging scenario must be adjacent to the concept, not the same domain.

Context:
${formatBuildInput(input)}`,
  });
};

const formatBuildInput = (input: BuildContentAgentInput): string => {
  const clusterContext = input.planContext.clusterContext
    ? `${input.planContext.clusterContext.title}: ${input.planContext.clusterContext.summary} | Why it matters: ${input.planContext.clusterContext.whyItMatters}`
    : "None";
  const integrationContext = input.planContext.integrationContext
    ? input.planContext.integrationContext.completedClusterTitles.join(", ")
    : "None";
  const priorLearning =
    input.learner.priorLearning.length > 0
      ? input.learner.priorLearning
          .map(
            (attempt, index) =>
              `${index + 1}. ${attempt.title} | score=${attempt.score} | readiness=${attempt.readiness} | improvements=${attempt.improvements.join("; ") || "None"} | failures=${attempt.failureTags.join("; ") || "None"} | next=${attempt.nextStep}`,
          )
          .join("\n")
      : "No prior learning recorded.";

  return `Mode: ${input.mode}
Node: ${input.node.kind} | ${input.node.title}
Node summary: ${input.node.summary}
Why it matters: ${input.node.whyItMatters}
Slot position: ${input.planContext.slotIndex} of ${input.planContext.totalSlots}
Cluster context: ${clusterContext}
Completed clusters for integration: ${integrationContext}
Target identity: ${input.learner.targetIdentity}
Prior learning:
${priorLearning}
Learner seed response:
${input.learner.seedResponse?.trim() || "Not provided yet."}`;
};
