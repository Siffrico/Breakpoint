import { Effect } from "effect";

import type { EducationExperienceCustomization } from "@acme/validators";

import { ProfileRepo } from "../profile-repo";

export const updateEducationExperienceWorkflow = (
  userId: string,
  customization: EducationExperienceCustomization,
) =>
  Effect.gen(function* () {
    const repo = yield* ProfileRepo;
    const preference = yield* repo.updateEducationExperienceByUserId(
      userId,
      customization,
    );
    return preference.customization;
  });
