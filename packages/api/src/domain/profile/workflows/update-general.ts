import { Effect } from "effect";

import type { UpdateProfileGeneralInput } from "../profile-repo";
import { ProfileRepo } from "../profile-repo";

export const updateProfileGeneralWorkflow = (
  input: UpdateProfileGeneralInput,
) =>
  Effect.gen(function* () {
    const repo = yield* ProfileRepo;
    return yield* repo.updateGeneralBySession(input);
  });
