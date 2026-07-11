import { tool } from "ai";
import { z } from "zod/v4";

import type { MissionPlan, MissionProof, MissionSpec } from "@acme/validators";
import {
  EditPlanArgsSchema,
  FinalizePlanArgsSchema,
  MissionQuestionArgsSchema,
  ProposeMissionsArgsSchema,
} from "@acme/validators";

const CompleteMissionArgsSchema = z.object({
  debrief: z.string().min(1).max(1_000),
});

/** Builds only the tools for one already-authorized mission stream. */
export const createMissionCreatorTools = ({
  confirmPlan,
  getMission,
  submittedProof,
  completeMission,
}: {
  confirmPlan: (input: {
    spec: MissionSpec;
    plan: MissionPlan;
  }) => Promise<void>;
  getMission: () => Promise<{ spec: MissionSpec | null } | null>;
  submittedProof?: MissionProof;
  completeMission: (input: {
    proof: MissionProof;
    debrief: string;
  }) => Promise<void>;
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
    execute: async ({ spec, plan }) => {
      await confirmPlan({ spec, plan });
      return { spec, plan };
    },
  }),
  edit_plan: tool({
    description:
      "Replace the current plan in response to the learner's constraint or request.",
    inputSchema: EditPlanArgsSchema,
    execute: async ({ plan }) => {
      const mission = await getMission();
      if (!mission?.spec)
        throw new Error("A mission must be chosen before its plan can change.");
      await confirmPlan({ spec: mission.spec, plan });
      return { spec: mission.spec, plan };
    },
  }),
  complete_mission: tool({
    description:
      "Write a warm debrief for the learner's submitted proof and finish the mission. Never reject proof in v1.",
    inputSchema: CompleteMissionArgsSchema,
    execute: async ({ debrief }) => {
      if (!submittedProof)
        throw new Error("The learner must submit proof before completion.");
      await completeMission({ proof: submittedProof, debrief });
      return { proof: submittedProof, debrief };
    },
  }),
});

export type MissionCreatorToolResult =
  | { spec: MissionSpec; plan: MissionPlan }
  | { proof: MissionProof; debrief: string };
