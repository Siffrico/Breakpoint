import type { ProfileError, ProfileGeneral } from "../types";
import type { Result } from "../../../lib/result";

interface GetGeneralDependencies {
  getGeneral: () => Promise<Result<ProfileGeneral | null, ProfileError>>;
}

export const getProfileGeneralWorkflow = async ({
  deps,
}: {
  deps: GetGeneralDependencies;
}): Promise<Result<ProfileGeneral | null, ProfileError>> => deps.getGeneral();
