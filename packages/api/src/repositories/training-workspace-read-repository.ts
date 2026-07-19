import type { db as databaseClient } from "@acme/db/client";

import type { LearningProjectSummary } from "../domain/training/workflows/get-workspace-shell-workflow";
import { deriveProvisionalProjectTitle } from "../domain/training/services/provisional-project-title";
import { trainingAttemptRepository } from "./training-attempt-repository";
import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { trainingOnboardingRepository } from "./training-onboarding-repository";

type Database = typeof databaseClient;

export const trainingWorkspaceReadRepository = {
  listLearningProjectsForUser: async ({
    db,
    userId,
  }: {
    db: Database;
    userId: string;
  }): Promise<LearningProjectSummary[]> => {
    const sessions = await trainingOnboardingRepository.listSessionsByUser({
      db,
      userId,
    });
    const sessionIds = sessions.map((session) => session.id);
    const [profiles, plans, firstUserMessages, chatUnits] = await Promise.all([
      trainingOnboardingRepository.listProfilesBySessionIds({
        db,
        sessionIds,
      }),
      trainingCurriculumRepository.listPlansBySessionIds({ db, sessionIds }),
      trainingOnboardingRepository.listFirstUserMessagesBySessionIds({
        db,
        sessionIds,
      }),
      trainingOnboardingRepository.listChatUnitIdsBySessionIds({
        db,
        sessionIds,
      }),
    ]);
    const profileBySessionId = new Map(
      profiles.map(({ profile, version }) => [
        profile.onboardingSessionId,
        {
          targetIdentity: version.targetIdentity,
          headline: version.headline,
        },
      ]),
    );
    const planBySessionId = new Map(
      plans.map((plan) => [plan.onboardingSessionId, plan]),
    );
    const firstUserMessageBySessionId = new Map(
      firstUserMessages.map((message) => [message.sessionId, message.content]),
    );
    const chatUnitIdsBySessionId = new Map<string, Set<string>>();
    for (const chatUnit of chatUnits) {
      const unitIds = chatUnitIdsBySessionId.get(chatUnit.sessionId);
      if (unitIds) unitIds.add(chatUnit.unitId);
      else {
        chatUnitIdsBySessionId.set(
          chatUnit.sessionId,
          new Set([chatUnit.unitId]),
        );
      }
    }
    const nodes = await trainingCurriculumRepository.listNodesByPlanIds({
      db,
      planIds: plans.map((plan) => plan.id),
    });
    const sessionIdByPlanId = new Map(
      plans.map((plan) => [plan.id, plan.onboardingSessionId]),
    );
    const projectNodesBySessionId = new Map<string, typeof nodes>();
    for (const node of nodes) {
      const sessionId = sessionIdByPlanId.get(node.planId);
      if (!sessionId) continue;
      const existing = projectNodesBySessionId.get(sessionId);
      if (existing) existing.push(node);
      else projectNodesBySessionId.set(sessionId, [node]);
    }

    let onboardingProjectEmitted = false;
    return sessions.flatMap((session) => {
      const profile = profileBySessionId.get(session.id) ?? null;
      const plan = planBySessionId.get(session.id) ?? null;
      const title =
        (plan?.title.trim() ?? "") ||
        (profile?.targetIdentity.trim() ?? "") ||
        deriveProvisionalProjectTitle(
          firstUserMessageBySessionId.get(session.id) ?? "",
        );
      if (!title) return [];

      const lessonPreview = (projectNodesBySessionId.get(session.id) ?? [])
        .filter((node) => node.kind === "unit" || node.kind === "integration")
        .filter((node) => chatUnitIdsBySessionId.get(session.id)?.has(node.id))
        .sort((left, right) => right.orderIndex - left.orderIndex)
        .slice(0, 10)
        .map((node) => ({
          id: node.id,
          title: node.title,
          status: node.status,
        }));
      const status =
        plan?.status === "active"
          ? "active"
          : plan ||
              session.status === "ready_for_generation" ||
              session.status === "complete"
            ? "building"
            : "onboarding";
      if (status === "onboarding") {
        if (onboardingProjectEmitted) return [];
        onboardingProjectEmitted = true;
      }

      return [
        {
          sessionId: session.id,
          title,
          headline:
            profile?.headline ?? plan?.summary ?? "Interview in progress.",
          status,
          lessonPreview,
          updatedAt: session.updatedAt ?? session.createdAt,
        },
      ];
    });
  },

  getHomeState: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }) => {
    const [profile, plan, summary, attemptHistory, nodeScores] =
      await Promise.all([
        trainingOnboardingRepository.getProfileBySession({ db, sessionId }),
        trainingCurriculumRepository.getActivePlan({ db, sessionId }),
        trainingAttemptRepository.getHomeSummary({ db, sessionId }),
        trainingAttemptRepository.listAttemptHistory({ db, sessionId }),
        trainingAttemptRepository.listNodeScoresBySession({ db, sessionId }),
      ]);
    if (!profile || !plan || !summary) return null;

    const learningNodes = plan.nodes.filter(
      (node) => node.kind === "unit" || node.kind === "integration",
    );
    const nextNode = plan.nodes.find((node) => node.id === plan.nextUnitId);
    const lastAttempt = attemptHistory.at(-1) ?? null;
    const demonstratedCapabilities: string[] = [];
    const seen = new Set<string>();
    for (const dimension of attemptHistory
      .slice(-10)
      .flatMap((attempt) => attempt.growthDimensions ?? [])
      .reverse()) {
      if (!seen.has(dimension)) {
        seen.add(dimension);
        demonstratedCapabilities.unshift(dimension);
      }
      if (demonstratedCapabilities.length >= 3) break;
    }

    return {
      targetIdentity: profile.version.targetIdentity,
      headline: profile.version.headline,
      planTitle: plan.title,
      planSummary: plan.summary,
      completedUnits: learningNodes.filter(
        (node) => node.status === "completed",
      ).length,
      totalUnits: learningNodes.length,
      nextUnitId: plan.nextUnitId,
      nextUnitTitle:
        summary.currentUnit?.title ??
        (nextNode
          ? nextNode.kind === "integration"
            ? "Integration unit ready"
            : "Next unit ready"
          : null),
      blockingSignals:
        summary.recentFailureTags.length > 0
          ? summary.recentFailureTags
          : profile.version.confidenceFlags.length > 0
            ? profile.version.confidenceFlags
            : profile.version.behaviorSignals.slice(0, 3),
      lastCompletedUnit: lastAttempt
        ? {
            title: lastAttempt.title,
            score: lastAttempt.score,
            failureTags: lastAttempt.failureTags,
          }
        : null,
      demonstratedCapabilities,
      nodeScores,
    };
  },
};
