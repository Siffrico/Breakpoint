import { tool } from "ai";
import { z } from "zod/v4";

import type {
  MissionEvaluation,
  MissionPlan,
  MissionProof,
  MissionSpec,
} from "@acme/validators";
import {
  EditPlanArgsSchema,
  FinalizePlanArgsSchema,
  MissionQuestionArgsSchema,
  ProposeMissionsArgsSchema,
} from "@acme/validators";

const CompleteMissionArgsSchema = z.object({});

/**
 * Builds only the tools for one already-authorized mission stream. Both
 * plan-writing tools share one callback: omitting `spec` means "keep the
 * already-chosen mission", and the workflow behind the callback owns that
 * precondition — a tool must not enforce lifecycle rules itself.
 */
export const createMissionCreatorTools = ({
  confirmPlan,
  submittedProof,
  evaluateMission,
}: {
  confirmPlan: (input: {
    spec?: MissionSpec;
    plan: MissionPlan;
  }) => Promise<{ spec: MissionSpec; plan: MissionPlan }>;
  submittedProof?: MissionProof;
  evaluateMission: (proof: MissionProof) => Promise<MissionEvaluation>;
}) => ({
  ask: tool({
    description:
      "Render one short adaptive question card. Ask only one question.",
    inputSchema: MissionQuestionArgsSchema,
    execute: (args) => args,
  }),
  propose_missions: tool({
    description: "Render exactly three tailored real-world mission choices.",
    inputSchema: ProposeMissionsArgsSchema,
    execute: (args) => args,
  }),
  finalize_plan: tool({
    description:
      "Confirm the learner's chosen mission and render its concrete plan.",
    inputSchema: FinalizePlanArgsSchema,
    execute: ({ spec, plan }) => confirmPlan({ spec, plan }),
  }),
  edit_plan: tool({
    description:
      "Replace the current plan in response to the learner's constraint or request.",
    inputSchema: EditPlanArgsSchema,
    execute: ({ plan }) => confirmPlan({ plan }),
  }),
  complete_mission: tool({
    description:
      "Evaluate the learner's submitted proof against the mission standard. This completes the mission only when the returned evaluation passes.",
    inputSchema: CompleteMissionArgsSchema,
    execute: async () => {
      if (!submittedProof)
        throw new Error("The learner must submit proof before completion.");
      return evaluateMission(submittedProof);
    },
  }),
});

export type MissionCreatorToolResult =
  | { spec: MissionSpec; plan: MissionPlan }
  | MissionEvaluation;
