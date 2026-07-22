import { Effect } from "effect";

import { MissionRepo } from "../mission-repo";

/**
 * The workspace projection's mission badge: does this unit have a mission row
 * yet, and where is it. Eligibility is deliberately not applied — the caller is
 * rendering state it already decided to show.
 */
export const getMissionStatusWorkflow = ({
  userId,
  unitContentId,
  sessionId,
}: {
  readonly userId: string;
  readonly unitContentId: string;
  readonly sessionId: string;
}) =>
  Effect.gen(function* () {
    const repo = yield* MissionRepo;
    const unitRunId = yield* repo.findUnitRunId({
      userId,
      unitContentId,
      sessionId,
    });
    if (!unitRunId) return null;

    const access = yield* repo.loadMissionAccess({ userId, unitRunId });
    return { unitRunId, status: access?.mission?.status ?? null };
  });
