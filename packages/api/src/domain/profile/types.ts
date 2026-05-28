export type { ProfileAccount, ProfileBilling, ProfileGeneral } from "@acme/validators";

export type ProfileErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "INTERNAL_SERVER_ERROR";

export interface ProfileError {
  code: ProfileErrorCode;
  message: string;
}
