import { Effect } from "effect";

import { MissionRepo } from "../mission-repo";

/** Thin by design: it keeps every router procedure on the same workflow seam. */
export const listResumableMissionsWorkflow = ({
  userId,
  sessionId,
}: {
  readonly userId: string;
  readonly sessionId: string;
}) =>
  Effect.gen(function* () {
    const repo = yield* MissionRepo;
    return yield* repo.listResumable({ userId, sessionId });
  });
