import type { ScenarioArchetype, ScenarioVerifier } from "@acme/validators";
import { UnitContextSchema } from "@acme/validators";

import type { UnitContent } from "../types/training.types";
import { SELECT_OPTION_COUNT } from "../engine/scenario-archetypes";

const LABELED_OPTION_PATTERN =
  /(?:^|\s)(?:[-*]\s*)?(?:\*\*)?\(?([A-D])(?:\)|[.:])(?:\*\*)?[ \t]+\S/gim;
const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/i;
const EXPOSED_FIXED_ANSWER_PATTERN =
  /\b(?:(?:correct\s+)?answer\s*(?:is|:)\s*|worked\s+(?:example|reasoning)\b)/i;
const AUTHORING_DEBRIS_PATTERN =
  /\b(?:author(?:ing)? note|drafting note|internal note|hmm)\b|\b\S+\.png\b/i;

export const getScenarioTaskReadinessIssue = ({
  prompt,
  responseMode,
}: {
  prompt: string;
  responseMode: ScenarioArchetype;
}): string | null => {
  if (HTML_TAG_PATTERN.test(prompt)) {
    return "Learner task must use Markdown, not raw HTML.";
  }
  if (responseMode !== "select") return null;

  if (EXPOSED_FIXED_ANSWER_PATTERN.test(prompt)) {
    return "Selected-response task must be unsolved and must not expose an answer.";
  }

  const labels = new Set(
    [...prompt.matchAll(LABELED_OPTION_PATTERN)].map((match) =>
      match[1]?.toUpperCase(),
    ),
  );
  return labels.size === SELECT_OPTION_COUNT
    ? null
    : `Selected-response task must include ${SELECT_OPTION_COUNT} options labeled A-D; found ${labels.size}.`;
};

export const getUnitReadinessIssue = (
  unit: Pick<UnitContent, "unitContext">,
): string | null =>
  UnitContextSchema.safeParse(unit.unitContext).success
    ? null
    : "Unit capability context is missing or invalid.";

export const getReviewPresentationReadinessIssue = ({
  assistantMessage,
  verifier,
}: {
  assistantMessage: string;
  verifier: ScenarioVerifier;
}): string | null => {
  if (EXPOSED_FIXED_ANSWER_PATTERN.test(assistantMessage)) {
    return "Scenario must not contain a worked solution or expose its answer.";
  }
  if (AUTHORING_DEBRIS_PATTERN.test(assistantMessage)) {
    return "Scenario must not contain drafting notes or filenames.";
  }
  if (verifier.kind !== "fixed_answer") return null;

  const optionIssue = getScenarioTaskReadinessIssue({
    prompt: assistantMessage,
    responseMode: "select",
  });
  if (optionIssue) return optionIssue;
  return null;
};
