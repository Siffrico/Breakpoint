import type { ModelMessage } from "ai";
import type { Effect } from "effect";

import type { MentorCheckOutput, MentorOpeningOutput } from "./agent-contracts";
import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import {
  mentorCheckOutputSchema,
  mentorOpeningOutputSchema,
} from "./agent-contracts";
import {
  MENTOR_SYSTEM_PROMPT,
  mentorCheckInstruction,
  mentorOpeningInstruction,
} from "./mentor-prompt";
import { runUnitAgent } from "./run-unit-agent";

const mentorSystem = (experience: EducationExperienceDefinition) =>
  `${MENTOR_SYSTEM_PROMPT}\n\n## Customized behavior\n${experience.main.instructions}`;

export const runMentorOpeningAgent = ({
  context,
  experience,
  currentCapabilityId,
  selectedResponse,
  onPartialAssistantMessage,
}: {
  context: string;
  experience: EducationExperienceDefinition;
  currentCapabilityId: string;
  selectedResponse: boolean;
  onPartialAssistantMessage?: (content: string) => void;
}): Effect.Effect<{ object: MentorOpeningOutput }, UnitAgentError> =>
  runUnitAgent({
    agent: "mentor",
    purpose: "education",
    reasoning: "none",
    system: mentorSystem(experience),
    messages: [],
    context: `${context}\n\n${mentorOpeningInstruction(currentCapabilityId)}`,
    schema: mentorOpeningOutputSchema(selectedResponse),
    schemaName: "unit_mentor_opening",
    maxOutputTokens: 3_000,
    errorMessage: "Failed to open the education-unit mentor.",
    onPartialAssistantMessage,
  });

export const runMentorCheckAgent = ({
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
}): Effect.Effect<{ object: MentorCheckOutput }, UnitAgentError> =>
  runUnitAgent({
    agent: "mentor",
    purpose: "education",
    reasoning: "none",
    system: mentorSystem(experience),
    messages,
    context: `${context}\n\n${mentorCheckInstruction(currentCapabilityId)}`,
    schema: mentorCheckOutputSchema(currentCapabilityId),
    schemaName: "unit_mentor_check",
    maxOutputTokens: 900,
    errorMessage: "Failed to assess the learner's comprehension.",
    onPartialAssistantMessage,
  });
