import { Effect } from "effect";

import {
  MissionNotEligibleError,
  MissionNotFoundError,
} from "../mission-errors";
import { isEligibleForMission } from "../mission-lifecycle";
import { MissionRepo } from "../mission-repo";

/**
 * The authorization step every mission entrypoint except the eligibility probe
 * shares: one joined read, then the progression policy. Extracted so the rule
 * cannot drift between the router and the streaming route.
 */
export const requireEligibleAccess = ({
  userId,
  unitRunId,
}: {
  readonly userId: string;
  readonly unitRunId: string;
}) =>
  Effect.gen(function* () {
    const repo = yield* MissionRepo;
    const access = yield* repo.loadMissionAccess({ userId, unitRunId });
    if (!access) {
      return yield* new MissionNotFoundError({ entity: "mission unit" });
    }
    if (!isEligibleForMission(access)) {
      return yield* new MissionNotEligibleError({ unitRunId });
    }
    return access;
  });
