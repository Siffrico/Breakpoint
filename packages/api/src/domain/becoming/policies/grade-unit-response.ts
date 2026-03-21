import { generateObject } from "ai";

import { DebriefSchema } from "@acme/validators";

import type { Debrief, UnitContent } from "../types/becoming.types";
import { getBecomingModel } from "../services/becoming-model";

export const gradeUnitResponse = async ({
  response,
  unit,
  targetIdentity,
}: {
  response: string;
  unit: Pick<UnitContent, "title" | "concept" | "workedExample" | "scenario">;
  targetIdentity: string;
}): Promise<Debrief> => {
  const model = getBecomingModel();
  if (!model) {
    throw new Error("OPENAI_API_KEY is required for AI-generated debriefs.");
  }

  const { object } = await generateObject({
    model,
    schema: DebriefSchema,
    system:
      "You are the debrief engine for an identity-driven training product. Diagnose performance precisely. Be specific, rigorous, and unsentimental. Do not use motivational fluff or generic praise.",
    prompt: `Evaluate this scenario response and return a structured debrief.

Requirements:
- Score from 0 to 100.
- Use readiness of needs_repair, developing, or ready_for_next_unit.
- Strengths and improvements must be specific to the response.
- failureTags must be short snake_case labels.
- targetComparison must explain what the target self would have done differently.
- nextStep must be the single best follow-up action.

Target identity: ${targetIdentity}
Unit title: ${unit.title}
Concept: ${unit.concept}
Worked example: ${unit.workedExample}
Scenario title: ${unit.scenario.title}
Scenario prompt: ${unit.scenario.prompt}
Focus areas: ${unit.scenario.focusAreas.join(", ")}
Success criteria: ${unit.scenario.successCriteria.join("; ")}

Learner response:
${response}`,
  });

  return object;
};
