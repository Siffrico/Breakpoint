import type { Effect } from "effect";
import { Context } from "effect";

import type { DbError } from "../../effect/errors";
import type { ProfileNotFoundError } from "./errors";
import type { ProfileAccount, ProfileBilling, ProfileGeneral } from "./types";

export interface UpdateProfileGeneralInput {
  readonly sessionId: string;
  readonly targetIdentity: string;
  readonly motivation: string;
  readonly hardMoments: string[];
}

export interface ProfileRepoShape {
  readonly getGeneralBySession: (
    sessionId: string,
  ) => Effect.Effect<ProfileGeneral | null, DbError>;
  readonly updateGeneralBySession: (
    input: UpdateProfileGeneralInput,
  ) => Effect.Effect<
    Omit<ProfileGeneral, "unitActivity">,
    DbError | ProfileNotFoundError
  >;
  readonly getAccountByUserId: (
    userId: string,
  ) => Effect.Effect<ProfileAccount, DbError | ProfileNotFoundError>;
  readonly getBillingByUserId: (
    userId: string,
  ) => Effect.Effect<ProfileBilling>;
}

/** Domain-owned profile persistence capability. Live adapters belong outside the domain. */
export class ProfileRepo extends Context.Service<
  ProfileRepo,
  ProfileRepoShape
>()("api/ProfileRepo") {}
