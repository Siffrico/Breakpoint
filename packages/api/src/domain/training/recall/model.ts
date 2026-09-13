import type { z } from "zod/v4";
import { Effect } from "effect";

import type { RecallKnowledgeSnapshot, RecallScenario } from "@acme/validators";
import {
  RecallCorrectionAssessmentSchema as CorrectionSchema,
  RecallScenarioSchema,
  RecallRetrievalAssessmentSchema as RetrievalSchema,
} from "@acme/validators";

import { invokeStructuredModel } from "../engine/invoke-structured-model";
import { requireStructuredAiModelForPurpose } from "../engine/model-router";
import { RecallModelError } from "./errors";

const invokeRecall = <T>(run: () => PromiseLike<T>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new RecallModelError({
        message: "The recall check could not be evaluated. Please try again.",
        cause,
      }),
  });

const streamPartialOutput = async (
  stream: AsyncIterable<unknown>,
  render: (partial: unknown) => string,
  onPartial?: (content: string) => void,
) => {
  if (!onPartial) return;
  for await (const partial of stream) {
    const content = render(partial);
    if (content) onPartial(content);
  }
};

const readString = (value: unknown, key: string): string | null => {
  if (!value || typeof value !== "object") return null;
  const field: unknown = Reflect.get(value, key);
  return typeof field === "string" ? field : null;
};

const renderRetrievalPartial = (partial: unknown): string =>
  [
    readString(partial, "feedback"),
    readString(partial, "explanation"),
    readString(partial, "correctionQuestion"),
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

const renderCorrectionPartial = (partial: unknown): string =>
  [readString(partial, "feedback"), readString(partial, "nextQuestion")]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

export const generateRecallScenario = ({
  snapshot,
  previousChallenges,
}: {
  snapshot: RecallKnowledgeSnapshot;
  previousChallenges: readonly string[];
}): Effect.Effect<RecallScenario, RecallModelError> =>
  invokeRecall(
    () =>
      invokeStructuredModel({
        model: requireStructuredAiModelForPurpose(
          "recall",
          "recall scenario generation",
        ),
        schema: RecallScenarioSchema,
        schemaName: "recall_scenario",
        maxSteps: 1,
        reasoning: "low",
        maxOutputTokens: 2_000,
        system: `Create one fair, self-contained applied retrieval task for exactly the assigned knowledge item. Related context may make the situation realistic, but it must not add grading targets. Produce a private verifier that states the reasoning required and disqualifying errors. Never reveal the verifier in the challenge. Make the scenario materially different from previous scenarios.`,
        prompt: JSON.stringify({ snapshot, previousChallenges }),
      }).output,
  );

export const gradeRecallRetrieval = (
  input: {
    snapshot: RecallKnowledgeSnapshot;
    scenario: RecallScenario;
    answer: string;
  },
  onPartial?: (content: string) => void,
): Effect.Effect<z.infer<typeof RetrievalSchema>, RecallModelError> =>
  invokeRecall(async () => {
    const result = invokeStructuredModel({
      model: requireStructuredAiModelForPurpose("recall", "recall grading"),
      schema: RetrievalSchema,
      schemaName: "recall_retrieval_assessment",
      maxSteps: 1,
      reasoning: "medium",
      maxOutputTokens: 2_500,
      system: `Assess only the supplied criterion IDs. Return exactly one evidence entry per criterion. If any criterion fails, explanation and correctionQuestion must teach the gap and ask one small application question; otherwise both must be null. Do not reward keywords without applied reasoning. Do not mention private verifier data.`,
      prompt: JSON.stringify(input),
    });
    const [output] = await Promise.all([
      result.output,
      streamPartialOutput(
        result.partialOutputStream,
        renderRetrievalPartial,
        onPartial,
      ),
    ]);
    return output;
  });

export const gradeRecallCorrection = (
  input: {
    snapshot: RecallKnowledgeSnapshot;
    scenario: RecallScenario;
    correctionQuestion: string;
    answer: string;
  },
  onPartial?: (content: string) => void,
): Effect.Effect<z.infer<typeof CorrectionSchema>, RecallModelError> =>
  invokeRecall(async () => {
    const result = invokeStructuredModel({
      model: requireStructuredAiModelForPurpose(
        "recall",
        "recall correction grading",
      ),
      schema: CorrectionSchema,
      schemaName: "recall_correction_assessment",
      maxSteps: 1,
      reasoning: "medium",
      maxOutputTokens: 2_500,
      system: `Assess whether the learner applies the corrected reasoning, using exactly one evidence entry per assigned criterion. Agreement or "I understand" is never sufficient. When the gap remains, nextQuestion must be a more focused application question. When every criterion passes, nextQuestion must be null.`,
      prompt: JSON.stringify(input),
    });
    const [output] = await Promise.all([
      result.output,
      streamPartialOutput(
        result.partialOutputStream,
        renderCorrectionPartial,
        onPartial,
      ),
    ]);
    return output;
  });
