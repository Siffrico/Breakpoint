import type { ScenarioArchetype } from "@acme/validators";
import { UnitContextSchema } from "@acme/validators";

import type { UnitContent } from "../types/training.types";
import { SELECT_OPTION_COUNT } from "../engine/scenario-archetypes";

const LABELED_OPTION_PATTERN =
  /(?:^|\s)(?:[-*]\s*)?(?:\*\*)?\(?([A-D])(?:\)|[.:])(?:\*\*)?[ \t]+\S/gim;
const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/i;
const EXPOSED_FIXED_ANSWER_PATTERN =
  /\b(?:(?:correct\s+)?answer\s*(?:is|:)\s*|worked\s+(?:example|reasoning)\b)/i;

export const getSeedTaskReadinessIssue = ({
  seedPrompt,
  responseMode,
}: {
  seedPrompt: string;
  responseMode: ScenarioArchetype;
}): string | null => {
  if (HTML_TAG_PATTERN.test(seedPrompt)) {
    return "Learner task must use Markdown, not raw HTML.";
  }
  if (responseMode !== "select") return null;

  if (EXPOSED_FIXED_ANSWER_PATTERN.test(seedPrompt)) {
    return "Selected-response task must be unsolved and must not expose an answer.";
  }

  const labels = new Set(
    [...seedPrompt.matchAll(LABELED_OPTION_PATTERN)].map((match) =>
      match[1]?.toUpperCase(),
    ),
  );
  return labels.size === SELECT_OPTION_COUNT
    ? null
    : `Selected-response task must include ${SELECT_OPTION_COUNT} options labeled A-D; found ${labels.size}.`;
};

export const getUnitReadinessIssue = (
  unit: Pick<UnitContent, "seedPrompt" | "unitContext">,
): string | null => {
  const context = UnitContextSchema.safeParse(unit.unitContext);
  if (!context.success) return "Unit capability context is missing or invalid.";
  return getSeedTaskReadinessIssue({
    seedPrompt: unit.seedPrompt,
    responseMode: context.data.testing.responseMode,
  });
};

export const getReviewPresentationReadinessIssue = ({
  assistantMessage,
  verifier,
}: {
  assistantMessage: string;
  verifier: {
    type: "fixed_answer" | "checker" | "judge_rubric";
    answer: string | null;
    checkerSpec: string | null;
    scratchpad: string;
  };
}): string | null => {
  if (verifier.type !== "fixed_answer") return null;

  if (!verifier.answer || !/^[A-D]$/i.test(verifier.answer.trim())) {
    return "Selected-response verifier answer must be one label from A-D.";
  }
  if (EXPOSED_FIXED_ANSWER_PATTERN.test(assistantMessage)) {
    return "Selected-response challenge must not contain a worked solution or expose its answer.";
  }
  const optionIssue = getSeedTaskReadinessIssue({
    seedPrompt: assistantMessage,
    responseMode: "select",
  });
  if (optionIssue) return optionIssue;
  return null;
};
