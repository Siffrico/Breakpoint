import { err, ok, type Result } from "../../../lib/result";
import { buildCurriculumPlan } from "../services/build-curriculum-plan";
import { buildIdentityReport } from "../services/build-identity-report";
import type {
  CurriculumBlueprint,
  CurriculumPlan,
  IdentityReport,
  OnboardingTranscriptMessage,
} from "../types/becoming.types";

interface GenerateCurriculumDependencies {
  getSession: (sessionId: string) => Promise<{
    id: string;
    status: string;
    userId?: string | null;
  } | null>;
  listMessages: (sessionId: string) => Promise<OnboardingTranscriptMessage[]>;
  createProfileVersion: (input: {
    sessionId: string;
    userId?: string | null;
    report: IdentityReport;
  }) => Promise<{ version: { id: string } } | null>;
  createPlan: (input: {
    onboardingSessionId: string;
    profileVersionId: string;
    userId?: string | null;
    blueprint: CurriculumBlueprint;
  }) => Promise<{ id: string } | null>;
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  updateSession: (input: {
    sessionId: string;
    status?: string;
    questionCount?: number;
    completedAt?: Date | null;
  }) => Promise<unknown>;
}

export const generateCurriculumWorkflow = async ({
  sessionId,
  deps,
}: {
  sessionId: string;
  deps: GenerateCurriculumDependencies;
}): Promise<Result<CurriculumPlan>> => {
  const session = await deps.getSession(sessionId);
  if (!session) {
    return err("Onboarding session does not exist.");
  }

  const existingPlan = await deps.getActivePlan(sessionId);
  if (existingPlan) {
    return ok(existingPlan);
  }

  const messages = await deps.listMessages(sessionId);

  let report;
  try {
    report = await buildIdentityReport(messages);
  } catch (error) {
    return err(
      error instanceof Error
        ? error.message
        : "Failed to generate the identity report.",
    );
  }
  if (!report.targetIdentity) {
    return err("Target identity is missing.");
  }

  const profile = await deps.createProfileVersion({
    sessionId,
    userId: session.userId,
    report,
  });
  if (!profile) {
    return err("Failed to build identity profile.");
  }

  let blueprint;
  try {
    blueprint = await buildCurriculumPlan(report);
  } catch (error) {
    return err(
      error instanceof Error
        ? error.message
        : "Failed to generate the curriculum architecture.",
    );
  }
  const plan = await deps.createPlan({
    onboardingSessionId: sessionId,
    profileVersionId: profile.version.id,
    userId: session.userId,
    blueprint,
  });
  if (!plan) {
    return err("Failed to create curriculum plan.");
  }

  await deps.updateSession({
    sessionId,
    status: "complete",
  });

  const createdPlan = await deps.getActivePlan(sessionId);
  return createdPlan ? ok(createdPlan) : err("Curriculum plan was not found.");
};
