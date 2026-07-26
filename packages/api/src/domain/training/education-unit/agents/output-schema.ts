import { z } from "zod/v4";

import type { ModelEventEvidence } from "../model-event";
import type { ScenarioSpec } from "../scenario-spec";
import {
  ConnectionGradedEvidenceSchema,
  SolutionGradedEvidenceSchema,
} from "../model-event";
import { ScenarioSpecOutputSchema } from "../scenario-spec";

const assistantMessage = z
  .string()
  .describe(
    "The complete substantive learner-facing Markdown reply, never a placeholder or fragment. Emit the full reply in this field first. Never include private grading evidence, canonical answers, rubrics, or scenario specifications.",
  );
export const LearnerFacingAssistantMessageSchema = z
  .string()
  .trim()
  .min(24, "assistantMessage must be a substantive learner-facing reply");
const noEvent = z.literal(null);
const noScenarioSpec = z.literal(null);
const promptedEvent = z
  .object({
    type: z.literal("phase_continues"),
    reason: z.literal("prompted"),
  })
  .strict();
const needsMoreWorkEvent = z
  .object({
    type: z.literal("phase_continues"),
    reason: z.literal("needs_more_work"),
  })
  .strict();

export const OrientOutputSchema = z
  .object({
    assistantMessage,
    event: noEvent,
    scenarioSpec: noScenarioSpec,
  })
  .strict();

export const TeachOutputSchema = z
  .object({
    assistantMessage,
    event: noEvent,
    scenarioSpec: ScenarioSpecOutputSchema,
  })
  .strict();

export const ConnectPresentationOutputSchema = z
  .object({
    assistantMessage,
    event: promptedEvent,
    scenarioSpec: ScenarioSpecOutputSchema,
  })
  .strict();

export const ConnectEvaluationOutputSchema = z
  .object({
    assistantMessage,
    event: ConnectionGradedEvidenceSchema,
    scenarioSpec: noScenarioSpec,
  })
  .strict();

export const SolvePresentationOutputSchema = z
  .object({
    assistantMessage,
    event: promptedEvent,
    scenarioSpec: noScenarioSpec,
  })
  .strict();

export const RecallPresentationOutputSchema = z
  .object({
    assistantMessage,
    event: promptedEvent,
    scenarioSpec: ScenarioSpecOutputSchema,
  })
  .strict();

export const SolveEvaluationOutputSchema = z
  .object({
    assistantMessage,
    event: z.discriminatedUnion("type", [
      needsMoreWorkEvent,
      SolutionGradedEvidenceSchema,
    ]),
    scenarioSpec: noScenarioSpec,
  })
  .strict();

export type PhaseAgentMode =
  | "orient"
  | "teach"
  | "connect-presentation"
  | "connect-evaluation"
  | "solve-presentation"
  | "recall-presentation"
  | "solve-evaluation";

export interface PhaseAgentOutput {
  readonly assistantMessage: string;
  readonly event: ModelEventEvidence | null;
  readonly scenarioSpec: ScenarioSpec | null;
}

export const getPhaseAgentOutputSchema = (
  mode: PhaseAgentMode,
): z.ZodType<PhaseAgentOutput> => {
  switch (mode) {
    case "orient":
      return OrientOutputSchema;
    case "teach":
      return TeachOutputSchema;
    case "connect-presentation":
      return ConnectPresentationOutputSchema;
    case "connect-evaluation":
      return ConnectEvaluationOutputSchema;
    case "solve-presentation":
      return SolvePresentationOutputSchema;
    case "recall-presentation":
      return RecallPresentationOutputSchema;
    case "solve-evaluation":
      return SolveEvaluationOutputSchema;
  }
};
