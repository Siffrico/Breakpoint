import { Effect } from "effect";

import type { MissionPlan, MissionSpec } from "@acme/validators";

import { MissionNotReadyError } from "../mission-errors";
import { MissionRepo } from "../mission-repo";

/**
 * Backs both plan-writing tools. `finalize_plan` supplies the spec; `edit_plan`
 * omits it and must inherit the already-chosen one — the precondition that used
 * to live in the tool's own execute(). The completed-mission guard belongs to
 * repo.confirmPlan's setWhere, not to a read here.
 */
export const confirmMissionPlanWorkflow = ({
  userId,
  unitRunId,
  spec,
  plan,
}: {
  readonly userId: string;
  readonly unitRunId: string;
  readonly spec?: MissionSpec;
  readonly plan: MissionPlan;
}) =>
  Effect.gen(function* () {
    const repo = yield* MissionRepo;
    let resolvedSpec = spec;

    if (!resolvedSpec) {
      const access = yield* repo.loadMissionAccess({ userId, unitRunId });
      if (!access?.mission?.spec) {
        return yield* new MissionNotReadyError({ operation: "edit_plan" });
      }
      resolvedSpec = access.mission.spec;
    }

    yield* repo.confirmPlan({ userId, unitRunId, spec: resolvedSpec, plan });
    return { spec: resolvedSpec, plan };
  });
