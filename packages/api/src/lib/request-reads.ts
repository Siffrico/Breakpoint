import type { db as databaseClient } from "@acme/db/client";

import { trainingCurriculumRepository } from "../repositories/training-curriculum-repository";
import { trainingOnboardingRepository } from "../repositories/training-onboarding-repository";

type Database = typeof databaseClient;

export const createRequestReads = (db: Database) => {
  const sessions = new Map<
    string,
    ReturnType<typeof trainingOnboardingRepository.getSession>
  >();
  const activePlans = new Map<
    string,
    ReturnType<typeof trainingCurriculumRepository.getActivePlan>
  >();

  return {
    getSession: (sessionId: string) => {
      const cached = sessions.get(sessionId);
      if (cached) return cached;

      const pending = trainingOnboardingRepository.getSession({
        db,
        sessionId,
      });
      sessions.set(sessionId, pending);
      return pending;
    },
    getActivePlan: (sessionId: string) => {
      const cached = activePlans.get(sessionId);
      if (cached) return cached;

      const pending = trainingCurriculumRepository.getActivePlan({
        db,
        sessionId,
      });
      activePlans.set(sessionId, pending);
      return pending;
    },
  };
};

export type RequestReads = ReturnType<typeof createRequestReads>;
