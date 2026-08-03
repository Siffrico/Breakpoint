import { Effect } from "effect";

import { DEFAULT_EDUCATION_EXPERIENCE_CUSTOMIZATION } from "../../training/education-unit/experience";
import { ProfileRepo } from "../profile-repo";

export const getEducationExperienceWorkflow = (userId: string) =>
  Effect.gen(function* () {
    const repo = yield* ProfileRepo;
    const preference = yield* repo.getEducationExperienceByUserId(userId);
    return {
      customization:
        preference?.customization ?? DEFAULT_EDUCATION_EXPERIENCE_CUSTOMIZATION,
      defaults: DEFAULT_EDUCATION_EXPERIENCE_CUSTOMIZATION,
    };
  });
