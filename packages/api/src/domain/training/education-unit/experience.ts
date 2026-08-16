import { Effect } from "effect";

import type {
  EducationExperienceCustomization,
  EducationExperienceSnapshot,
} from "@acme/validators";
import {
  EducationExperienceCustomizationSchema,
  EducationExperienceSnapshotSchema,
} from "@acme/validators";

export interface EducationExperienceDefinition {
  readonly snapshot: {
    readonly id: string;
    readonly version: number;
  };
  readonly main: {
    readonly instructions: string;
  };
  readonly reviewer: {
    readonly instructions: string;
  };
}

export const DEFAULT_EDUCATION_EXPERIENCE = {
  snapshot: { id: "breakpoint-mentor", version: 2 },
  main: {
    instructions:
      "Build autonomous capability one interaction at a time. Diagnose the learner's present blocker, choose the smallest high-leverage mentoring move, and stay on the current capability until the learner's own reasoning demonstrates it.",
  },
  reviewer: {
    instructions:
      "Act as an adversarial afterburner: independently find where the learner's capability could fail, apply realistic format-appropriate pressure, make the learner improve the weak point, and grade the resulting performance honestly.",
  },
} as const satisfies EducationExperienceDefinition;

export const DEFAULT_EDUCATION_EXPERIENCE_CUSTOMIZATION =
  EducationExperienceCustomizationSchema.parse({
    main: DEFAULT_EDUCATION_EXPERIENCE.main,
    reviewer: DEFAULT_EDUCATION_EXPERIENCE.reviewer,
  });

export const resolveEducationExperienceCustomization = (
  preference: {
    readonly version: number;
    readonly customization: EducationExperienceCustomization;
  } | null,
): EducationExperienceDefinition =>
  preference
    ? {
        snapshot: {
          id: "customized-breakpoint-mentor",
          version: preference.version,
        },
        main: preference.customization.main,
        reviewer: preference.customization.reviewer,
      }
    : DEFAULT_EDUCATION_EXPERIENCE;

export const snapshotEducationExperience = (
  experience: EducationExperienceDefinition,
): EducationExperienceSnapshot =>
  EducationExperienceSnapshotSchema.parse({
    id: experience.snapshot.id,
    version: experience.snapshot.version,
    main: experience.main,
    reviewer: experience.reviewer,
  });

export const resolveEducationExperience = (
  snapshot: EducationExperienceSnapshot,
): Effect.Effect<EducationExperienceDefinition> =>
  Effect.succeed({
    snapshot: { id: snapshot.id, version: snapshot.version },
    main: snapshot.main,
    reviewer: snapshot.reviewer,
  });
