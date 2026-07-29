import { Data, Effect } from "effect";

import type { EducationExperienceSnapshot } from "@acme/validators";

export interface ExperienceTodoDefinition {
  readonly id: string;
  readonly goal: string;
  readonly completionEvidence: readonly string[];
}

export interface EducationExperienceDefinition {
  readonly snapshot: EducationExperienceSnapshot;
  readonly main: {
    readonly instructions: string;
  };
  readonly reviewer: {
    readonly instructions: string;
    readonly todos: readonly ExperienceTodoDefinition[];
  };
}

export const DEFAULT_EDUCATION_EXPERIENCE = {
  snapshot: { id: "breakpoint-mentor", version: 1 },
  main: {
    instructions:
      "Build autonomous capability one todo at a time. Diagnose the learner's present blocker, choose the smallest high-leverage mentoring move, and stay on the current capability until the learner's own reasoning demonstrates it.",
  },
  reviewer: {
    instructions:
      "Act as an adversarial afterburner: independently find where the learner's capability could fail, apply realistic format-appropriate pressure, make the learner improve the weak point, and grade the resulting performance honestly.",
    todos: [
      {
        id: "test-without-tutor-framing",
        goal: "Test the target capabilities without copying the mentor's framing or examples.",
        completionEvidence: [
          "The learner responds to a novel surface without relying on wording supplied by the mentor.",
        ],
      },
      {
        id: "probe-plausible-failure",
        goal: "Find and probe the most plausible way the learner's model could break in real work.",
        completionEvidence: [
          "The challenge closes shallow shortcuts and exposes a specific fragility or demonstrates stability.",
        ],
      },
      {
        id: "force-improvement",
        goal: "Push the learner to defend, revise, or extend the work where pressure reveals a weakness.",
        completionEvidence: [
          "The learner independently repairs the weakness or justifies why the challenged decision remains sound.",
        ],
      },
      {
        id: "grade-goldilocks-evidence",
        goal: "Produce calibrated evidence for Goldilocks from the adversarial performance.",
        completionEvidence: [
          "Every capability dimension has a cited score and the primary error classification is recorded.",
        ],
      },
    ],
  },
} as const satisfies EducationExperienceDefinition;

export class EducationExperienceNotFoundError extends Data.TaggedError(
  "EducationExperienceNotFoundError",
)<{ readonly id: string; readonly version: number }> {}

export const resolveEducationExperience = (
  snapshot: EducationExperienceSnapshot,
): Effect.Effect<
  EducationExperienceDefinition,
  EducationExperienceNotFoundError
> =>
  snapshot.id === DEFAULT_EDUCATION_EXPERIENCE.snapshot.id &&
  snapshot.version === DEFAULT_EDUCATION_EXPERIENCE.snapshot.version
    ? Effect.succeed(DEFAULT_EDUCATION_EXPERIENCE)
    : Effect.fail(
        new EducationExperienceNotFoundError({
          id: snapshot.id,
          version: snapshot.version,
        }),
      );
