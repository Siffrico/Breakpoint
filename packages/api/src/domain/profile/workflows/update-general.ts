import type { ProfileError, ProfileGeneral } from "../types";
import type { Result } from "../../../lib/result";

interface UpdateGeneralDependencies {
  updateGeneral: () => Promise<Result<ProfileGeneral, ProfileError>>;
}

export const updateProfileGeneralWorkflow = async ({
  deps,
}: {
  deps: UpdateGeneralDependencies;
}): Promise<Result<ProfileGeneral, ProfileError>> => deps.updateGeneral();
