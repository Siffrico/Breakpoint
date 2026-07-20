import type { db as databaseClient } from "@acme/db/client";

import type { UnitPreparationDependencies } from "../domain/training/unit-preparation/prepare-unit-content";
import { trainingAttemptRepository } from "./training-attempt-repository";
import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { trainingOnboardingRepository } from "./training-onboarding-repository";
import { trainingSyllabusRepository } from "./training-syllabus-repository";
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
  getUnitSyllabusContext: (unitNodeId) =>
    trainingSyllabusRepository.getUnitContext({ db, unitNodeId }),
  createUnitContentIfAbsent: (payload) =>
    trainingCurriculumRepository.createUnitContentIfAbsent({ db, ...payload }),
  replaceUnitContent: (payload) =>
    trainingCurriculumRepository.replaceUnitContent({ db, ...payload }),
  withUnitBuildLock: (nodeId, run) => withUnitBuildLock({ db, nodeId, run }),
});
