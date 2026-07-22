import { Effect } from "effect";

import { MissionRepo } from "../mission-repo";
import { requireEligibleAccess } from "./require-eligible-access";

/**
 * Moves a chosen mission to active. The lifecycle guard (resumable status,
 * spec and plan present) is enforced inside repo.start's WHERE clause — this
 * workflow authorizes, then surfaces whatever the write decided. It
 * deliberately does not pre-check the mission row: that read-then-write is
 * exactly the race this refactor removes.
 */
export const startMissionWorkflow = ({
  userId,
  unitRunId,
}: {
  readonly userId: string;
  readonly unitRunId: string;
}) =>
  Effect.gen(function* () {
    const repo = yield* MissionRepo;
    yield* requireEligibleAccess({ userId, unitRunId });
    yield* repo.start({ userId, unitRunId });
    return { status: "active" as const };
  });
