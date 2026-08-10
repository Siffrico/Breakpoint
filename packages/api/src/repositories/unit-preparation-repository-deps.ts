import type { db as databaseClient } from "@acme/db/client";
import { eq } from "@acme/db";
import { TrainingCurriculumPlan } from "@acme/db/schema";

import type { UnitPreparationDependencies } from "../domain/training/unit-preparation/prepare-unit-content";
import { resolveClusterDirective } from "./resolve-cluster-directive";
import { skillKnowledgeRepository } from "./skill-knowledge-repository";
import { trainingAttemptRepository } from "./training-attempt-repository";
import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { trainingOnboardingRepository } from "./training-onboarding-repository";
import { withUnitBuildLock } from "./unit-build-lock";

type Database = typeof databaseClient;

export const createUnitPreparationRepositoryDeps = (
  db: Database,
): UnitPreparationDependencies => ({
  getUnitByNodeId: (nodeId) =>
    trainingCurriculumRepository.getUnitByNodeId({ db, nodeId }),
  getPlanNodesBySession: (sessionId) =>
    trainingCurriculumRepository.getPlanNodesBySession({ db, sessionId }),
  getTargetIdentity: async (sessionId) => {
    const profile = await trainingOnboardingRepository.getProfileBySession({
      db,
      sessionId,
    });
    return profile?.version.targetIdentity ?? null;
  },
  listAttemptHistory: (sessionId) =>
    trainingAttemptRepository.listAttemptHistory({ db, sessionId }),
  getUnitDifficulty: async (unitNodeId) => {
    const unit = await trainingCurriculumRepository.getNodeById({
      db,
      nodeId: unitNodeId,
    });
    if (!unit?.parentNodeId) return null;
    const plan = await db.query.TrainingCurriculumPlan.findFirst({
      where: eq(TrainingCurriculumPlan.id, unit.planId),
    });
    const session = plan
      ? await trainingOnboardingRepository.getSession({
          db,
          sessionId: plan.onboardingSessionId,
        })
      : null;
    if (!session?.userId) return null;
    const { promptBlock, directive } = await resolveClusterDirective({
      db,
      userId: session.userId,
      clusterNodeId: unit.parentNodeId,
    });
    return { promptBlock, bandOrder: directive.bandOrder };
  },
  getUnitKnowledgeContext: (unitNodeId) =>
    skillKnowledgeRepository.getUnitContext({ db, unitNodeId }),
  createUnitContentIfAbsent: (payload) =>
    trainingCurriculumRepository.createUnitContentIfAbsent({ db, ...payload }),
  replaceUnitContent: (payload) =>
    trainingCurriculumRepository.replaceUnitContent({ db, ...payload }),
  // A savepoint keeps this optional write from aborting the unit-build
  // transaction while still making successful content + briefing atomic.
  saveNodeBriefing: (payload) =>
    db
      .transaction(async (tx) =>
        trainingCurriculumRepository.saveNodeBriefing({
          db: tx as unknown as Database,
          ...payload,
        }),
      )
      .catch(() => null),
  // Rebinds the deps to the lock's own connection so the whole build rides
  // one pooled connection instead of holding the lock on one and querying
  // through others (which can deadlock an exhausted pool).
  withUnitBuildLock: (nodeId, build, loadReady, options) =>
    withUnitBuildLock({
      db,
      nodeId,
      build: (lockDb) => build(createUnitPreparationRepositoryDeps(lockDb)),
      loadReady: (readyDb) =>
        loadReady(createUnitPreparationRepositoryDeps(readyDb)),
      rebuildReady: options?.rebuildReady,
    }),
});
