import type { Effect } from "effect";
import type { z } from "zod/v4";

import type { MentorPartsOutput, PartsShape } from "./agent-contracts";
import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import {
  mentorLessonOutputSchema,
  mentorPartsOutputSchema,
  renderPartialParts,
} from "./agent-contracts";
import {
  MENTOR_BASE_PROMPT,
  MENTOR_PARTS_MODULE,
  MENTOR_TEACH_MODULE,
  mentorLessonInstruction,
  mentorPartsInstruction,
} from "./mentor-prompt";
import { runUnitAgent } from "./run-unit-agent";

const mentorSystem = (
  experience: EducationExperienceDefinition,
  module: string,
) =>
  [
    MENTOR_BASE_PROMPT,
    module,
    `## Customized behavior\n${experience.main.instructions}`,
  ].join("\n\n");

export const runMentorLessonAgent = ({
  context,
  experience,
  onPartialAssistantMessage,
}: {
  context: string;
  experience: EducationExperienceDefinition;
  onPartialAssistantMessage?: (content: string) => void;
}): Effect.Effect<
  { object: z.infer<typeof mentorLessonOutputSchema> },
  UnitAgentError
> =>
  runUnitAgent({
    agent: "mentor",
    purpose: "education",
    reasoning: "none",
    system: mentorSystem(experience, MENTOR_TEACH_MODULE),
    messages: [],
    context: `${context}\n\n${mentorLessonInstruction}`,
    schema: mentorLessonOutputSchema,
    schemaName: "unit_mentor_lesson",
    maxOutputTokens: 15_000,
    temperature: 0.2,
    errorMessage: "Failed to write the lesson.",
    onPartialAssistantMessage,
  });

export const runMentorPartsAgent = ({
  context,
  experience,
  shape,
  label,
  letters,
  hypothesis,
  onPartialAssistantMessage,
}: {
  context: string;
  experience: EducationExperienceDefinition;
  shape: PartsShape;
  label: "learn" | "exam";
  /** The letter of each part to write, in order. */
  letters: readonly string[];
  /** What the last feedback suspected, for the part to test. */
  hypothesis: string | null;
  onPartialAssistantMessage?: (content: string) => void;
}): Effect.Effect<{ object: MentorPartsOutput }, UnitAgentError> =>
  runUnitAgent({
    agent: "mentor",
    purpose: "education",
    reasoning: "high",
    system: mentorSystem(experience, MENTOR_PARTS_MODULE),
    messages: [],
    context: `${context}\n\n${mentorPartsInstruction({
      label,
      opensRound: shape.opensRound,
      letters,
      acknowledgesExplanation: shape.acknowledgesExplanation,
      hypothesis,
    })}`,
    schema: mentorPartsOutputSchema(shape),
    schemaName: "unit_mentor_parts",
    renderPartial: renderPartialParts(
      (letters[0] ?? "a").charCodeAt(0) - "a".charCodeAt(0),
    ),
    maxOutputTokens: 15_000,
    reasoningBudgetTokens: 2_400,
    temperature: 0.2,
    errorMessage: "Failed to write the round's parts.",
    onPartialAssistantMessage,
  });
