import type { ProfileAccount, ProfileError } from "../types";
import type { Result } from "../../../lib/result";

interface GetAccountDependencies {
  getAccount: () => Promise<Result<ProfileAccount, ProfileError>>;
}

export const getProfileAccountWorkflow = async ({
  deps,
}: {
  deps: GetAccountDependencies;
}): Promise<Result<ProfileAccount, ProfileError>> => deps.getAccount();
