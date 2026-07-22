import { Effect } from "effect";

import { isEligibleForMission } from "../mission-lifecycle";
import { MissionRepo } from "../mission-repo";

/** Either a run id directly, or the unit/session pair the workspace knows. */
export type MissionEligibilityInput =
  | { readonly unitRunId: string }
  | { readonly unitContentId: string; readonly sessionId: string };

/**
 * Answers "does this unit earn a field mission?". Ineligibility is a valid
 * answer here rather than a failure, so only DbError rides the error channel.
 */
export const getMissionEligibilityWorkflow = ({
  userId,
  input,
}: {
  readonly userId: string;
  readonly input: MissionEligibilityInput;
}) =>
  Effect.gen(function* () {
    const repo = yield* MissionRepo;
    const unitRunId =
      "unitRunId" in input
        ? input.unitRunId
        : yield* repo.findUnitRunId({ userId, ...input });
    if (!unitRunId) return { eligible: false, unitRunId: null };

    const access = yield* repo.loadMissionAccess({ userId, unitRunId });
    const eligible = access !== null && isEligibleForMission(access);
    return { eligible, unitRunId: eligible ? unitRunId : null };
  });
