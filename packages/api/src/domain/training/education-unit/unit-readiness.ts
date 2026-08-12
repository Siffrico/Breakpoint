import type { ScenarioArchetype } from "@acme/validators";
import { UnitContextSchema } from "@acme/validators";

import type { UnitContent } from "../types/training.types";
import { SELECT_OPTION_COUNT } from "../engine/scenario-archetypes";

const LABELED_OPTION_PATTERN =
  /^\s*(?:[-*]\s*)?(?:\*\*)?\(?([A-D])(?:\)|[.:])(?:\*\*)?[ \t]+\S/gim;

export const getSeedTaskReadinessIssue = ({
  seedPrompt,
  responseMode,
}: {
  seedPrompt: string;
  responseMode: ScenarioArchetype;
}): string | null => {
  if (responseMode !== "select") return null;

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
