import type { db as databaseClient } from "@acme/db/client";

import type { UnitPreparationDependencies } from "../domain/training/unit-preparation/prepare-unit-content";
import { trainingAttemptRepository } from "./training-attempt-repository";
import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { trainingOnboardingRepository } from "./training-onboarding-repository";

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
  createUnitContent: (payload) =>
    trainingCurriculumRepository.createUnitContent({ db, ...payload }),
});
