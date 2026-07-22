import { Effect } from "effect";

import type { MissionProof } from "@acme/validators";

import { evaluateMissionProof } from "../evaluate-mission-proof";
import { decideMissionEvaluation } from "../mission-evaluation-policy";
import { MissionRepo } from "../mission-repo";

/**
 * Reserve → grade → decide → commit, with the reservation released on any exit
 * that is not a success.
 *
 * The release is expressed with Effect.onError rather than the old try/catch:
 * it also fires on defects and on interruption (a learner closing the stream
 * mid-evaluation), which the catch never covered. It is awaited before the
 * failure escapes — a reservation must be gone before the learner is told the
 * attempt failed, or their retry hits their own stale lock. A failing release
 * is logged and swallowed so it can never mask the original error.
 */
export const evaluateMissionAttemptWorkflow = ({
  userId,
  unitRunId,
  proof,
}: {
  readonly userId: string;
  readonly unitRunId: string;
  readonly proof: MissionProof;
}) =>
  Effect.gen(function* () {
    const repo = yield* MissionRepo;
    const reservation = yield* repo.reserveEvaluation({
      userId,
      unitRunId,
      proof,
    });

    return yield* Effect.gen(function* () {
      const draft = yield* evaluateMissionProof({
        spec: reservation.mission.spec,
        plan: reservation.mission.plan,
        proof,
      });
      const evaluation = decideMissionEvaluation({
        draft,
        attemptNumber: reservation.attemptNumber,
        firstScore: reservation.firstScore,
      });
      yield* repo.finishEvaluation({
        missionId: reservation.mission.id,
        attemptId: reservation.attemptId,
        proof,
        evaluation,
      });
      return evaluation;
    }).pipe(
      Effect.onError(() =>
        repo.cancelEvaluation(reservation.attemptId).pipe(
          Effect.catch((error) =>
            Effect.logError("Mission evaluation reservation release failed.", {
              tag: error._tag,
              operation: error.operation,
              attemptId: reservation.attemptId,
            }),
          ),
        ),
      ),
    );
  });
