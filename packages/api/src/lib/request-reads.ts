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

  // Failed reads are evicted so one transient DB error is not replayed to
  // every later consumer in the same request.
  const memo = <T>(
    cache: Map<string, Promise<T>>,
    sessionId: string,
    load: () => Promise<T>,
  ) => {
    const cached = cache.get(sessionId);
    if (cached) return cached;

    const pending = load();
    cache.set(sessionId, pending);
    pending.catch(() => {
      if (cache.get(sessionId) === pending) {
        cache.delete(sessionId);
      }
    });
    return pending;
  };

  return {
    getSession: (sessionId: string) =>
      memo(sessions, sessionId, () =>
        trainingOnboardingRepository.getSession({ db, sessionId }),
      ),
    getActivePlan: (sessionId: string) =>
      memo(activePlans, sessionId, () =>
        trainingCurriculumRepository.getActivePlan({ db, sessionId }),
      ),
  };
};

export type RequestReads = ReturnType<typeof createRequestReads>;
