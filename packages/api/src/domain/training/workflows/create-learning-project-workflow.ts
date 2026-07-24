import type { Result } from "../../../lib/result";
import type { IdentityReport } from "../types/training.types";
import { err, ok } from "../../../lib/result";

interface CreateLearningProjectDependencies {
  createSession: (userId: string) => Promise<{ id: string } | null>;
  createProfileVersion: (input: {
    sessionId: string;
    userId: string;
    report: IdentityReport;
  }) => Promise<{ version: { id: string } } | null>;
  updateSession: (input: {
    sessionId: string;
    status?: string;
    completedAt?: Date | null;
  }) => Promise<unknown>;
}

const normalizeProjectText = (value: string) =>
  value.trim().replace(/\s+/g, " ");

const buildProjectProfile = ({
  projectTitle,
  targetIdentity,
}: {
  projectTitle: string;
  targetIdentity: string;
}): { report: IdentityReport } => ({
  report: {
    targetIdentity,
    headline: `${projectTitle} learning project`,
    motivation: `Use ${projectTitle} as a concrete path toward ${targetIdentity}.`,
    currentBaseline:
      "The learner created the project from profile and has not generated its adaptive curriculum yet.",
    hardMoments: [
      "Converting project intent into applied work instead of passive review.",
    ],
    constraints: [],
    proofOfProgress: `Visible progress on ${projectTitle}.`,
    behaviorSignals: [
      "Explains concepts from memory before receiving help.",
      "Applies each unit to a concrete project decision.",
      "Uses feedback to repair weak reasoning instead of only moving forward.",
    ],
    confidenceFlags: ["The adaptive curriculum has not been generated yet."],
  },
});

export const createLearningProjectWorkflow = async ({
  userId,
  title,
  targetIdentity,
  deps,
}: {
  userId: string;
  title: string;
  targetIdentity?: string | null;
  deps: CreateLearningProjectDependencies;
}): Promise<Result<{ sessionId: string }>> => {
  const projectTitle = normalizeProjectText(title);
  const projectTargetIdentity = normalizeProjectText(
    targetIdentity && targetIdentity.trim().length > 0
      ? targetIdentity
      : projectTitle,
  );
  if (projectTitle.length < 2) {
    return err("Project name must be at least 2 characters.");
  }

  const session = await deps.createSession(userId);
  if (!session) {
    return err("Failed to create learning project.");
  }

  const profile = buildProjectProfile({
    projectTitle,
    targetIdentity: projectTargetIdentity,
  });
  const createdProfile = await deps.createProfileVersion({
    sessionId: session.id,
    userId,
    report: profile.report,
  });

  if (!createdProfile) {
    return err("Failed to create project profile.");
  }

  await deps.updateSession({
    sessionId: session.id,
    status: "ready_for_generation",
  });

  return ok({ sessionId: session.id });
};
