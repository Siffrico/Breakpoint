import type { db as databaseClient } from "@acme/db/client";

import type { BuildProjectDeps } from "../domain/training/orchestration/build-project";
import { designSyllabus } from "../domain/training/agents/syllabus-designer";
import { ArtifactBuildError } from "../domain/training/orchestration/agent-runtime";
import { mintNextUnit } from "../domain/training/unit-minting/mint-next-unit";
import { runPrepareUnit } from "../domain/training/unit-preparation/prepare-unit-edge";
import { buildProjectCheckpointRepository } from "./build-project-checkpoint-repository";
import { buildProjectCurriculumRepository } from "./build-project-curriculum-repository";
import { buildProjectProfileRepository } from "./build-project-profile-repository";
import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { trainingOnboardingRepository } from "./training-onboarding-repository";
import { trainingSyllabusRepository } from "./training-syllabus-repository";
import { createUnitMintingRepositoryDeps } from "./unit-minting-repository-deps";
import { createUnitPreparationRepositoryDeps } from "./unit-preparation-repository-deps";

type Database = typeof databaseClient;

export const ensureSkillSyllabus = async ({
  db,
  clusterNodeId,
  targetIdentity,
}: {
  db: Database;
  clusterNodeId: string;
  targetIdentity: string;
}) => {
  const cluster = await trainingCurriculumRepository.getNodeById({
    db,
    nodeId: clusterNodeId,
  });
  if (!cluster?.skillMap) return null;
  const existing = await trainingSyllabusRepository.listEntries({
    db,
    clusterNodeId,
  });
  if (existing.length > 0) return existing;
  const syllabus = await designSyllabus({
    title: cluster.title,
    summary: cluster.summary,
    targetIdentity,
    workflow: cluster.skillMap.workflow,
    masteryContract: cluster.skillMap.masteryContract,
  });
  return trainingSyllabusRepository.ensureSyllabus({
    db,
    clusterNodeId,
    entries: syllabus.entries,
  });
};

export const ensureSkillUnit = async ({
  db,
  clusterNodeId,
  sessionId,
  userId,
}: {
  db: Database;
  clusterNodeId: string;
  sessionId: string;
  userId: string;
}) =>
  mintNextUnit({
    clusterNodeId,
    deps: createUnitMintingRepositoryDeps({ db, sessionId, userId }),
  });

export const recoverSkillUnits = async ({
  db,
  sessionId,
  userId,
}: {
  db: Database;
  sessionId: string;
  userId: string;
}) => {
  const plan = await trainingCurriculumRepository.getActivePlan({
    db,
    sessionId,
  });
  if (!plan) return;
  const rawNodes = await trainingCurriculumRepository.listNodesByPlanIds({
    db,
    planIds: [plan.id],
  });
  const usesDynamicSkills = rawNodes.some((node) => node.skillMap != null);
  if (!usesDynamicSkills) {
    const hasReadyUnit = rawNodes.some(
      (node) =>
        (node.kind === "unit" || node.kind === "integration") &&
        node.status === "ready",
    );
    const latestCompletedUnit = rawNodes
      .filter(
        (node) =>
          (node.kind === "unit" || node.kind === "integration") &&
          node.status === "completed",
      )
      .at(-1);
    if (!hasReadyUnit && latestCompletedUnit) {
      await trainingCurriculumRepository.advancePlanAfterCompletion({
        db,
        nodeId: latestCompletedUnit.id,
      });
    }
    return;
  }
  const skills = plan.nodes.filter((node) => node.kind === "skill_cluster");
  await Promise.allSettled(
    skills.map(async (skill) => {
      const syllabus = await ensureSkillSyllabus({
        db,
        clusterNodeId: skill.id,
        targetIdentity: plan.targetIdentity,
      });
      if (syllabus) {
        await ensureSkillUnit({
          db,
          clusterNodeId: skill.id,
          sessionId,
          userId,
        });
      }
    }),
  );
};

/**
 * Edge adapter that wires {@link BuildProjectDeps} to the repositories for a
 * given db handle. Both the streaming chat route and the tRPC resume mutation
 * consume this so the project-first, per-artifact persistence stays in exactly
 * one place. Each persistence function is idempotent (safe to re-run on resume);
 * the two multi-write steps run in their own small transactions.
 */
export const createBuildProjectDeps = (db: Database): BuildProjectDeps => ({
  getPlanRow: async (sessionId) => {
    const plan = await buildProjectCurriculumRepository.getPlanRow({
      db,
      sessionId,
    });
    return plan
      ? {
          id: plan.id,
          status: plan.status,
          profileVersionId: plan.profileVersionId,
        }
      : null;
  },

  getActivePlan: (sessionId) =>
    trainingCurriculumRepository.getActivePlan({ db, sessionId }),

  claimRun: (payload) =>
    buildProjectCheckpointRepository.claimRun({ db, ...payload }),

  updateRun: (payload) =>
    buildProjectCheckpointRepository.updateRun({ db, ...payload }),

  getArtifacts: ({ sessionId, sourceKey }) =>
    buildProjectCheckpointRepository.listArtifacts({
      db,
      sessionId,
      sourceKey,
    }),

  saveArtifact: (payload) =>
    buildProjectCheckpointRepository.upsertArtifact({
      db,
      ...payload,
    }),

  ensureShell: async ({
    sessionId,
    userId,
    title,
    summary,
    targetIdentity,
  }) => {
    const plan = await buildProjectCurriculumRepository.upsertPlanShell({
      db,
      sessionId,
      userId,
      title,
      summary,
      targetIdentity,
    });
    return { id: plan.id };
  },

  persistCurriculum: async ({
    sessionId,
    userId,
    planId,
    report,
    beforeAfter,
    blueprint,
  }) => {
    await db.transaction(async (tx) => {
      const dbTx = tx as unknown as Database;
      const profile = await buildProjectProfileRepository.upsertProfileVersion({
        db: dbTx,
        sessionId,
        userId,
        report,
        beforeAfter,
      });
      if (!profile) {
        throw new ArtifactBuildError(
          "Failed to save the learner profile.",
          "save",
        );
      }
      await buildProjectCurriculumRepository.linkPlanProfileVersion({
        db: dbTx,
        planId,
        profileVersionId: profile.version.id,
      });
      await buildProjectCurriculumRepository.replacePlanNodes({
        db: dbTx,
        planId,
        blueprint,
        title: blueprint.title,
        summary: blueprint.summary,
        targetIdentity: blueprint.targetIdentity,
      });
    });
  },

  persistOverview: ({ sessionId, overview }) =>
    buildProjectCurriculumRepository.updatePlanOverview({
      db,
      sessionId,
      overview,
    }),

  finalize: ({ sessionId, planId }) =>
    db.transaction(async (tx) => {
      const dbTx = tx as unknown as Database;
      await buildProjectCurriculumRepository.finalizePlan({
        db: dbTx,
        planId,
        status: "active",
      });
      await trainingOnboardingRepository.updateSession({
        db: dbTx,
        sessionId,
        status: "complete",
        completedAt: new Date(),
      });
      return trainingCurriculumRepository.getActivePlan({
        db: dbTx,
        sessionId,
      });
    }),

  prepareUnit: ({ node, sessionId }) =>
    runPrepareUnit({
      node,
      sessionId,
      deps: createUnitPreparationRepositoryDeps(db),
    }),
  ensureSkillSyllabus: (input) => ensureSkillSyllabus({ db, ...input }),
  mintSkillUnit: ({ clusterNodeId, sessionId, userId }) =>
    ensureSkillUnit({ db, clusterNodeId, sessionId, userId }),
});
