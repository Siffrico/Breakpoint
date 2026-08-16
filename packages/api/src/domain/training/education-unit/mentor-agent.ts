import type { ModelMessage } from "ai";
import { Effect } from "effect";

import type {
  MentorTeachingOutput,
  ReviewPresentationOutput,
} from "./agent-contracts";
import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import {
  mentorHandoffOutputSchema,
  mentorOpeningOutputSchema,
  renderMentorOpening,
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
  scenario,
}: {
  experience: EducationExperienceDefinition;
  teach: boolean;
  scenario: boolean;
}) =>
  [
    MENTOR_BASE_PROMPT,
    teach ? MENTOR_TEACH_MODULE : null,
    scenario ? MENTOR_SCENARIO_MODULE : null,
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
}): Effect.Effect<{ object: MentorTeachingOutput }, UnitAgentError> => {
  const base = {
    agent: "mentor" as const,
    purpose: "education" as const,
    reasoning: "none" as const,
    system: mentorSystem({
      experience,
      teach: true,
      scenario: createScenario,
    }),
    messages,
    context: `${context}\n\n${mentorTeachingInstruction(createScenario)}`,
    schemaName: "unit_mentor_teaching",
    errorMessage: "Failed to run the education-unit mentor.",
    onPartialAssistantMessage,
  };
  if (createScenario) {
    return runUnitAgent({
      ...base,
      schema: mentorHandoffOutputSchema(selectedResponse),
      maxOutputTokens: 3_000,
    });
  }
  return runUnitAgent({
    ...base,
    schema: mentorOpeningOutputSchema,
    maxOutputTokens: 1_200,
    renderPartialAssistantMessage: (partial) => renderMentorOpening(partial),
  }).pipe(
    Effect.map(({ object }) => ({
      object: {
        assistantMessage: renderMentorOpening(object),
        preparedScenario: null,
      },
    })),
  );
};

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
    system: mentorSystem({ experience, teach: false, scenario: true }),
    messages: [],
    context: `${context}\n\n${mentorScenarioInstruction(pass)}`,
    schema: reviewPresentationSchema(selectedResponse),
    schemaName: "unit_mentor_scenario",
    maxOutputTokens: 3_000,
    errorMessage: "Failed to create the education-unit scenario.",
    onPartialAssistantMessage,
  });
