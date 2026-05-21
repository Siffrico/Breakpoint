import type { ForgeUnitContent } from "../../types/training.types";

export const formatUnitContext = (unit: ForgeUnitContent): string =>
  `Unit title: ${unit.title}
Unit content:
${unit.buildContent ?? "Build content missing."}`;

export const formatUnitMeta = (meta: {
  title: string;
  summary: string;
  whyItMatters: string;
}): string =>
  `Unit title: ${meta.title}
Unit summary: ${meta.summary}
Why it matters: ${meta.whyItMatters}`;

export const formatPracticeResponses = (
  responses: Array<{
    sequence: number;
    response: string;
    feedback: string;
    passed: boolean;
  }>,
): string => {
  if (responses.length === 0) return "None recorded.";

  return responses
    .map(
      (item) =>
        `Practice ${item.sequence + 1} | passed=${item.passed} | response=${item.response} | feedback=${item.feedback}`,
    )
    .join("\n");
};
