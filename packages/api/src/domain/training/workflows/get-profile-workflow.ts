import { err, ok, type Result } from "../../../lib/result";
import type { ProfileState } from "../types/training.types";

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
