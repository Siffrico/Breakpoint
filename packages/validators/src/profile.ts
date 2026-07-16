import { z } from "zod/v4";

export const PROFILE_MAX_TARGET_IDENTITY_CHARS = 240;
export const PROFILE_MAX_MOTIVATION_CHARS = 2_000;
export const PROFILE_MAX_HARD_MOMENT_CHARS = 240;
export const PROFILE_MAX_HARD_MOMENTS = 12;

export const ProfileGeneralSchema = z.object({
  sessionId: z.string().uuid(),
  targetIdentity: z.string().min(1).max(PROFILE_MAX_TARGET_IDENTITY_CHARS),
  motivation: z.string().min(1).max(PROFILE_MAX_MOTIVATION_CHARS),
  hardMoments: z
    .array(z.string().min(1).max(PROFILE_MAX_HARD_MOMENT_CHARS))
    .max(PROFILE_MAX_HARD_MOMENTS),
  unitActivity: z.array(
    z.object({
      date: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
});

export const ProfileAccountSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  provider: z.string().min(1).nullable(),
  image: z.string().url().nullable(),
});

export const ProfileBillingSchema = z.object({
  plan: z.enum(["free"]),
  manageUrl: z.string().min(1).nullable(),
});

export const UpdateProfileGeneralInputSchema = ProfileGeneralSchema.pick({
  sessionId: true,
  targetIdentity: true,
  motivation: true,
  hardMoments: true,
});

export type ProfileGeneral = z.infer<typeof ProfileGeneralSchema>;
export type ProfileAccount = z.infer<typeof ProfileAccountSchema>;
export type ProfileBilling = z.infer<typeof ProfileBillingSchema>;
