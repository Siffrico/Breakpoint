import { Effect } from "effect";

import { requireAiModelForPurpose } from "../../engine/model-router";
import { buildMissionContext } from "../context";
import {
  MissionConflictError,
  MissionModelUnavailableError,
} from "../mission-errors";
import { requireEligibleAccess } from "./require-eligible-access";

/**
 * The entire mission-stream preamble as one call: authorize the run, refuse a
 * closed mission, build the system context, and resolve the model. The stream
 * entrypoint used to do all four inline — including a raw curriculum-plan
 * query that bypassed the repository.
 */
export const openMissionConsultationWorkflow = ({
  userId,
  unitRunId,
}: {
  readonly userId: string;
  readonly unitRunId: string;
}) =>
  Effect.gen(function* () {
    const access = yield* requireEligibleAccess({ userId, unitRunId });
    if (access.mission?.status === "completed") {
      return yield* new MissionConflictError({ reason: "already_completed" });
    }

    const model = yield* Effect.try({
      try: () => requireAiModelForPurpose("mission", "mission chat"),
      catch: (cause) =>
        new MissionModelUnavailableError({ purpose: "mission", cause }),
    });

    return {
      model,
      context: buildMissionContext({
        goal: access.plan.targetIdentity,
        unitTitle: access.unit.title,
        unitGoal: access.node.summary,
        concepts: access.unit.scenarioFocusAreas,
      }),
      mission: access.mission,
    };
  });
