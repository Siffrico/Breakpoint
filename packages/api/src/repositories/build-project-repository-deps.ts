import { Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import {
  CurriculumModeSchema,
  StartingPointTierSchema,
} from "@acme/validators";

import type { BuildProjectDeps } from "../domain/training/orchestration/build-project";
import {
  getMemoryContentHash,
  normalizeMemoryContent,
} from "../domain/memory/policies/memory-caps";
import { ArtifactBuildError } from "../domain/training/orchestration/agent-runtime";
import { createNextUnit } from "../domain/training/unit-creation/create-next-unit";
import { buildProjectCheckpointRepository } from "./build-project-checkpoint-repository";
import { buildProjectCurriculumRepository } from "./build-project-curriculum-repository";
import { buildProjectProfileRepository } from "./build-project-profile-repository";
import { memoryRepository } from "./memory-repository";
import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { trainingOnboardingRepository } from "./training-onboarding-repository";
import {
  createUnitCreationRepositoryDeps,
  ensureSkillKnowledge,
} from "./unit-creation-repository-deps";

type Database = typeof databaseClient;

export const ensureSkillUnit = async ({
  db,
  skillNodeId,
  sessionId,
  userId,
}: {
  db: Database;
  skillNodeId: string;
  sessionId: string;
  userId: string;
}) =>
  Effect.runPromise(
    createNextUnit({
      skillNodeId,
      deps: createUnitCreationRepositoryDeps({ db, sessionId, userId }),
    }),
  );

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
  hasUnitContent: async (nodeId) =>
    Boolean(await trainingCurriculumRepository.getUnitByNodeId({ db, nodeId })),

  claimRun: (payload) =>
    buildProjectCheckpointRepository.claimRun({ db, ...payload }),

  updateRun: (payload) =>
    buildProjectCheckpointRepository.updateRun({ db, ...payload }),

  heartbeatRun: (payload) =>
    buildProjectCheckpointRepository.heartbeatRun({ db, ...payload }),

  getArtifacts: ({ sessionId, sourceKey }) =>
    buildProjectCheckpointRepository.listArtifacts({
      db,
      sessionId,
      sourceKey,
    }),

  saveArtifact: ({ ownershipToken, ...payload }) =>
    buildProjectCheckpointRepository.withRunOwnership({
      db,
      sessionId: payload.sessionId,
      ownershipToken,
      run: (dbTx) =>
        buildProjectCheckpointRepository.upsertArtifact({
          db: dbTx,
          ...payload,
        }),
    }),

  getStartingPoint: async (sessionId) => {
    const session = await trainingOnboardingRepository.getSession({
      db,
      sessionId,
    });
    const parsed = StartingPointTierSchema.safeParse(
      session?.startingPointTier,
    );
    if (!parsed.success || !session?.startingPointLabel) return null;
    return { tier: parsed.data, label: session.startingPointLabel };
  },

  getCurriculumMode: async (sessionId) => {
    const session = await trainingOnboardingRepository.getSession({
      db,
      sessionId,
    });
    // An unreadable or unrecognised value means the session predates the
    // column, so it is an ability-mode session by construction.
    return (
      CurriculumModeSchema.safeParse(session?.curriculumMode).data ?? "ability"
    );
  },

  persistScenarioInspiration: async ({ userId, content }) => {
    const normalized = normalizeMemoryContent(content);
    const result = await memoryRepository.create({
      db,
      userId,
      content: normalized,
      contentHash: getMemoryContentHash(normalized),
      source: "profile_update",
    });
    if (!result.success && result.error.code !== "CONFLICT") {
      throw new ArtifactBuildError(
        "Failed to save the learner's scenario interests.",
        "save",
      );
    }
  },

  ensureShell: async ({
    sessionId,
    ownershipToken,
    userId,
    title,
    summary,
    targetIdentity,
    curriculumMode,
    seedRating,
  }) => {
    const plan = await buildProjectCheckpointRepository.withRunOwnership({
      db,
      sessionId,
      ownershipToken,
      run: (dbTx) =>
        buildProjectCurriculumRepository.upsertPlanShell({
          db: dbTx,
          sessionId,
          userId,
          title,
          summary,
          targetIdentity,
          curriculumMode,
          seedRating,
        }),
    });
    return { id: plan.id };
  },

  persistCurriculum: async ({
    sessionId,
    ownershipToken,
    userId,
    planId,
    report,
    blueprint,
  }) => {
    await buildProjectCheckpointRepository.withRunOwnership({
      db,
      sessionId,
      ownershipToken,
      run: async (dbTx) => {
        const profile =
          await buildProjectProfileRepository.upsertProfileVersion({
            db: dbTx,
            sessionId,
            userId,
            report,
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
      },
    });
  },

  persistOverview: ({ sessionId, ownershipToken, overview }) =>
    buildProjectCheckpointRepository.withRunOwnership({
      db,
      sessionId,
      ownershipToken,
      run: (dbTx) =>
        buildProjectCurriculumRepository.updatePlanOverview({
          db: dbTx,
          sessionId,
          overview,
        }),
    }),

  finalize: ({ sessionId, ownershipToken, planId }) =>
    buildProjectCheckpointRepository.withRunOwnership({
      db,
      sessionId,
      ownershipToken,
      run: async (dbTx) => {
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
      },
    }),

  ensureSkillKnowledge: (input) => ensureSkillKnowledge({ db, ...input }),
  createSkillUnit: ({ skillNodeId, sessionId, userId }) =>
    ensureSkillUnit({ db, skillNodeId, sessionId, userId }),
});
