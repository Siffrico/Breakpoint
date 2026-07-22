import { Effect } from "effect";

import { MissionRepo } from "../mission-repo";
import { requireEligibleAccess } from "./require-eligible-access";

/**
 * The mission canvas read. Two round-trips: the joined access read, then the
 * attempt history — which is only fetched once a mission row actually exists.
 */
export const getMissionForUnitRunWorkflow = ({
  userId,
  unitRunId,
}: {
  readonly userId: string;
  readonly unitRunId: string;
}) =>
  Effect.gen(function* () {
    const repo = yield* MissionRepo;
    const access = yield* requireEligibleAccess({ userId, unitRunId });
    if (!access.mission) return null;

    const evaluations = yield* repo.listEvaluations(access.mission.id);
    return {
      ...access.mission,
      evaluations,
      sessionId: access.run.sessionId,
      nodeId: access.node.id,
    };
  });
