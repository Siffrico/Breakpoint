import { Effect } from "effect";

import { MissionRepo } from "../mission-repo";

/** The stream's post-response transcript write. */
export const saveMissionTranscriptWorkflow = ({
  userId,
  unitRunId,
  messages,
}: {
  readonly userId: string;
  readonly unitRunId: string;
  readonly messages: unknown[];
}) =>
  Effect.gen(function* () {
    const repo = yield* MissionRepo;
    yield* repo.upsertTranscript({ userId, unitRunId, messages });
  });
