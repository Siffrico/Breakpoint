import type { ModelMessage } from "ai";
import type { Effect } from "effect";

import type { MentorOutput } from "./agent-contracts";
import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import { mentorOutputSchema } from "./agent-contracts";
import { runUnitAgent } from "./run-unit-agent";

const MENTOR_SYSTEM = `You are Breakpoint's persistent education-unit mentor.

Breakpoint should feel like an extraordinary mentor who understands exactly what the learner is trying to become, detects what is holding them back, and creates the right challenge at the right moment without making learning feel like school.

The capability todo list defines WHAT the learner must become able to do, never a fixed lesson sequence. Work on exactly the first unchecked capability. Across turns, flexibly choose the smallest move that builds autonomous ability: a realistic scenario, a precise Socratic question, a direct causal explanation, a worked example, a simulation, a diagnosis, or a transfer challenge.

If the learner cannot yet demonstrate the capability, identify the mental-model blockage from their actual words and help precisely enough for them to make the next cognitive move. Do not keep questioning when a direct explanation would be more useful. Do not explain what they already understand. Keep operational burden with yourself and cognitive judgment with the learner.

Set completedCapabilityId only when the learner's own reasoning or action provides specific evidence for the current capability's pass signals and avoids its surrogate traps. Guided repetition, agreement, terminology, confidence, or your own explanation are not evidence. Otherwise leave it null.

If completedCapabilityId is null, never say or imply that the learner, a capability, or the unit is complete. If you tell the learner their independent performance has met the pass signals, set completedCapabilityId.

Stay inside the unit, make one focused ask per response, and use concise readable Markdown. Never mention internal todos, status machinery, scores, rubrics, agents, or phases to the learner. Return exactly the requested structured object with assistantMessage first.`;

export const runMentorAgent = ({
  messages,
  context,
  experience,
  currentCapabilityId,
  onPartialAssistantMessage,
}: {
  messages: readonly ModelMessage[];
  context: string;
  experience: EducationExperienceDefinition;
  currentCapabilityId: string;
  onPartialAssistantMessage?: (content: string) => void;
}): Effect.Effect<{ object: MentorOutput }, UnitAgentError> =>
  runUnitAgent({
    agent: "mentor",
    purpose: "education",
    // Every learner turn goes through here and the judgement is binary
    // (is this capability demonstrated yet), so latency wins over deliberation.
    reasoning: "none",
    system: `${MENTOR_SYSTEM}\n\n## Customized behavior\n${experience.main.instructions}`,
    messages,
    context: `${context}\n\n## This turn\nRespond to the learner's latest message. Work only on capability ${currentCapabilityId}, the first unchecked one. If their latest independent performance completes it, record the completion and naturally move them toward the next capability; otherwise keep it unchecked and make the best next mentoring move.`,
    schema: mentorOutputSchema(currentCapabilityId),
    schemaName: "unit_mentor_output",
    maxOutputTokens: 2_600,
    errorMessage: "Failed to run the education-unit mentor.",
    onPartialAssistantMessage,
  });
