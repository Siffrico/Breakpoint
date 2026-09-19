import type { ModelMessage } from "ai";
import type { Effect } from "effect";

import type {
  MentorTeachingOutput,
  ReviewPresentationOutput,
} from "./agent-contracts";
import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import {
  mentorHandoffOutputSchema,
  mentorOpeningOutputSchema,
  reviewPresentationSchema,
} from "./agent-contracts";
import {
  MENTOR_BASE_PROMPT,
  MENTOR_HANDOFF_MODULE,
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
  scenario: "none" | "handoff" | "direct";
}) =>
  [
    MENTOR_BASE_PROMPT,
    teach ? MENTOR_TEACH_MODULE : null,
    scenario === "handoff" ? MENTOR_HANDOFF_MODULE : null,
    scenario === "direct" ? MENTOR_SCENARIO_MODULE : null,
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
  testedCriterionIds,
  onPartialAssistantMessage,
}: {
  messages: readonly ModelMessage[];
  context: string;
  experience: EducationExperienceDefinition;
  createScenario: boolean;
  selectedResponse: boolean;
  testedCriterionIds: readonly string[];
  onPartialAssistantMessage?: (content: string) => void;
}): Effect.Effect<{ object: MentorTeachingOutput }, UnitAgentError> => {
  const base = {
    agent: "mentor" as const,
    purpose: "education" as const,
    reasoning: "none" as const,
    system: mentorSystem({
      experience,
      teach: true,
      scenario: createScenario ? "handoff" : "none",
    }),
    messages,
    context: `${context}\n\n${mentorTeachingInstruction(createScenario)}`,
    schemaName: "unit_mentor_teaching",
    errorMessage: "Failed to run the education-unit mentor.",
    temperature: 0.2,
    onPartialAssistantMessage,
  };
  return createScenario
    ? runUnitAgent({
        ...base,
        schema: mentorHandoffOutputSchema(
          selectedResponse,
          testedCriterionIds,
        ),
        maxOutputTokens: 15_000,
      })
    : runUnitAgent({
        ...base,
        schema: mentorOpeningOutputSchema,
        maxOutputTokens: 15_000,
      });
};

export const runMentorScenarioAgent = ({
  context,
  experience,
  pass,
  selectedResponse,
  testedCriterionIds,
  onPartialAssistantMessage,
}: {
  context: string;
  experience: EducationExperienceDefinition;
  pass: number;
  selectedResponse: boolean;
  testedCriterionIds: readonly string[];
  onPartialAssistantMessage?: (content: string) => void;
}): Effect.Effect<{ object: ReviewPresentationOutput }, UnitAgentError> =>
  runUnitAgent({
    agent: "mentor",
    purpose: "education",
    reasoning: "high",
    system: mentorSystem({ experience, teach: false, scenario: "direct" }),
    messages: [],
    context: `${context}\n\n${mentorScenarioInstruction(pass)}`,
    schema: reviewPresentationSchema(selectedResponse, testedCriterionIds),
    schemaName: "unit_mentor_scenario",
    maxOutputTokens: 15_000,
    reasoningBudgetTokens: 2_400,
    temperature: 0.2,
    errorMessage: "Failed to create the education-unit scenario.",
    onPartialAssistantMessage,
  });
