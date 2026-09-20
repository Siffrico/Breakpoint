import type { db as databaseClient } from "@acme/db/client";

import type { UnitPreparationDependencies } from "../domain/training/unit-preparation/prepare-unit-content";
import type { NodeBuildLeaseGuard } from "./node-build-lifecycle";
import { skillKnowledgeRepository } from "./skill-knowledge-repository";
import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { withUnitBuildLock } from "./unit-build-lock";

type Database = typeof databaseClient;

export const createUnitPreparationRepositoryDeps = (
  db: Database,
  withLease?: NodeBuildLeaseGuard,
): UnitPreparationDependencies => ({
  getUnitByNodeId: (nodeId) =>
    trainingCurriculumRepository.getUnitByNodeId({ db, nodeId }),
  getPlanNodesBySession: (sessionId) =>
    trainingCurriculumRepository.getPlanNodesBySession({ db, sessionId }),
  getUnitKnowledgeContext: (unitNodeId) =>
    skillKnowledgeRepository.getUnitContext({ db, unitNodeId }),
  createUnitContentIfAbsent: (payload) =>
    withLease
      ? withLease((leaseDb) =>
          trainingCurriculumRepository.createUnitContentIfAbsent({
            db: leaseDb,
            ...payload,
          }),
        )
      : trainingCurriculumRepository.createUnitContentIfAbsent({
          db,
          ...payload,
        }),
  replaceUnitContent: (payload) =>
    withLease
      ? withLease((leaseDb) =>
          trainingCurriculumRepository.replaceUnitContent({
            db: leaseDb,
            ...payload,
          }),
        )
      : trainingCurriculumRepository.replaceUnitContent({ db, ...payload }),
  // A savepoint keeps this optional write from aborting the unit-build
  // transaction while still making successful content + briefing atomic.
  saveNodeBriefing: (payload) => {
    const save = (writeDb: Database) =>
      writeDb.transaction(async (tx) =>
        trainingCurriculumRepository.saveNodeBriefing({
          db: tx as unknown as Database,
          ...payload,
        }),
      );
    return (withLease ? withLease(save) : save(db)).catch(() => null);
  },
  // Rebinds the deps to the lock's own connection so the whole build rides
  // one pooled connection instead of holding the lock on one and querying
  // through others (which can deadlock an exhausted pool).
  withUnitBuildLock: (nodeId, build, loadReady, options) =>
    withUnitBuildLock({
      db,
      nodeId,
      build: (lockDb, guardLease) =>
        build(createUnitPreparationRepositoryDeps(lockDb, guardLease)),
      loadReady: (readyDb) =>
        loadReady(createUnitPreparationRepositoryDeps(readyDb)),
      rebuildReady: options?.rebuildReady,
    }),
});
