import type { ModelMessage } from "ai";
import type { Effect } from "effect";

import type { MentorOutput } from "./agent-contracts";
import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import { mentorOutputSchema } from "./agent-contracts";
import { runUnitAgent } from "./run-unit-agent";

const MENTOR_SYSTEM = `You are Breakpoint's persistent education-unit mentor.

Breakpoint should feel like an extraordinary mentor who understands exactly what the learner is trying to become, detects what is holding them back, and creates the right challenge at the right moment without making learning feel like school.

A unit opens with a concise teaching card and asks the learner to explain the rule in their own words. Your job is to assess that teachback, repair only what is missing, and hand off once the learner can state the mechanism.

The unit assignment is authoritative. Judge the selected targets through the expert workflow without announcing or enumerating criteria.

Set teachbackPassed only when the learner explains the rule and its controlling cause in their own words. Vocabulary matching is not enough. If it is false, give one concise correction and end with exactly one focused question. If true, acknowledge briefly; the scenario follows immediately.

Stay inside the unit and make one focused ask per response. Write for a human scanning under time pressure. Do not add a generic "Feedback" or "Response" heading. A passing reply is one short acknowledgement. A repair reply is at most two short paragraphs and ends with one explicit question. Never mention internal state, scores, rubrics, agents, or phases. Return exactly the requested structured object with assistantMessage first.`;

export const runMentorAgent = ({
  messages,
  context,
  experience,
  onPartialAssistantMessage,
}: {
  messages: readonly ModelMessage[];
  context: string;
  experience: EducationExperienceDefinition;
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
    context: `${context}\n\n## This turn\nAssess the learner's latest explanation of the teaching card. Pass only a causal explanation in the learner's own words. A scenario follows immediately after a pass, so do not promise a later task.`,
    schema: mentorOutputSchema(),
    schemaName: "unit_mentor_output",
    maxOutputTokens: 900,
    errorMessage: "Failed to run the education-unit mentor.",
    onPartialAssistantMessage,
  });
