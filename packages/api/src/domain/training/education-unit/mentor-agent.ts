import type { ModelMessage } from "ai";
import type { Effect } from "effect";

import type {
  MentorTeachingOutput,
  ReviewPresentationOutput,
} from "./agent-contracts";
import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import {
  mentorTeachingOutputSchema,
  reviewPresentationSchema,
} from "./agent-contracts";
import {
  MENTOR_BASE_PROMPT,
  MENTOR_SCENARIO_MODULE,
  MENTOR_TEACH_MODULE,
  mentorScenarioInstruction,
  mentorTeachingInstruction,
} from "./mentor-prompt";
import { runUnitAgent } from "./run-unit-agent";

const mentorSystem = ({
  experience,
  teach,
}: {
  experience: EducationExperienceDefinition;
  teach: boolean;
}) =>
  [
    MENTOR_BASE_PROMPT,
    teach ? MENTOR_TEACH_MODULE : null,
    MENTOR_SCENARIO_MODULE,
    `## Customized behavior\n${experience.main.instructions}`,
  ]
    .filter((part): part is string => part !== null)
    .join("\n\n");

export const runMentorTeachingAgent = ({
  messages,
  context,
  experience,
  createScenario,
  selectedResponse,
  onPartialAssistantMessage,
}: {
  messages: readonly ModelMessage[];
  context: string;
  experience: EducationExperienceDefinition;
  createScenario: boolean;
  selectedResponse: boolean;
  onPartialAssistantMessage?: (content: string) => void;
}): Effect.Effect<{ object: MentorTeachingOutput }, UnitAgentError> =>
  runUnitAgent({
    agent: "mentor",
    purpose: "education",
    reasoning: "none",
    system: mentorSystem({ experience, teach: true }),
    messages,
    context: `${context}\n\n${mentorTeachingInstruction(createScenario)}`,
    schema: mentorTeachingOutputSchema(selectedResponse, createScenario),
    schemaName: "unit_mentor_teaching",
    maxOutputTokens: createScenario ? 3_000 : 1_500,
    errorMessage: "Failed to run the education-unit mentor.",
    onPartialAssistantMessage,
  });

export const runMentorScenarioAgent = ({
  context,
  experience,
  pass,
  selectedResponse,
  onPartialAssistantMessage,
}: {
  context: string;
  experience: EducationExperienceDefinition;
  pass: number;
  selectedResponse: boolean;
  onPartialAssistantMessage?: (content: string) => void;
}): Effect.Effect<{ object: ReviewPresentationOutput }, UnitAgentError> =>
  runUnitAgent({
    agent: "mentor",
    purpose: "education",
    reasoning: "low",
    system: mentorSystem({ experience, teach: false }),
    messages: [],
    context: `${context}\n\n${mentorScenarioInstruction(pass)}`,
    schema: reviewPresentationSchema(selectedResponse),
    schemaName: "unit_mentor_scenario",
    maxOutputTokens: 3_000,
    errorMessage: "Failed to create the education-unit scenario.",
    onPartialAssistantMessage,
  });
