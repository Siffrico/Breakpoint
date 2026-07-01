import { Effect } from "effect";

import { ProfileRepo } from "../profile-repo";

export const getProfileGeneralWorkflow = (sessionId: string) =>
  Effect.gen(function* () {
    const repo = yield* ProfileRepo;
    return yield* repo.getGeneralBySession(sessionId);
  });
