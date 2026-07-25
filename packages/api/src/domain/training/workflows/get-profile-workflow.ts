import type { Result } from "../../../lib/result";
import type { ProfileState } from "../types/training.types";
import { err, ok } from "../../../lib/result";

interface GetProfileDependencies {
  getProfileState: (sessionId: string) => Promise<ProfileState | null>;
}

export const getProfileWorkflow = async ({
  sessionId,
  deps,
}: {
  sessionId: string;
  deps: GetProfileDependencies;
}): Promise<Result<ProfileState>> => {
  const state = await deps.getProfileState(sessionId);
  return state ? ok(state) : err("Profile is not ready yet.");
};
