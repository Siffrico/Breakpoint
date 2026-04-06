import type { ProfileBilling, ProfileError } from "../types";
import type { Result } from "../../../lib/result";

interface GetBillingDependencies {
  getBilling: () => Promise<Result<ProfileBilling, ProfileError>>;
}

export const getProfileBillingWorkflow = async ({
  deps,
}: {
  deps: GetBillingDependencies;
}): Promise<Result<ProfileBilling, ProfileError>> => deps.getBilling();
