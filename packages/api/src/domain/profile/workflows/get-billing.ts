import { Effect } from "effect";

import { ProfileRepo } from "../profile-repo";

export const getProfileBillingWorkflow = (userId: string) =>
  Effect.gen(function* () {
    const repo = yield* ProfileRepo;
    return yield* repo.getBillingByUserId(userId);
  });
