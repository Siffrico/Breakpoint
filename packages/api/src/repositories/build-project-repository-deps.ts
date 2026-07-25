import { Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import { StartingPointTierSchema } from "@acme/validators";

import type { BuildProjectDeps } from "../domain/training/orchestration/build-project";
import {
  getMemoryContentHash,
  normalizeMemoryContent,
} from "../domain/memory/policies/memory-caps";
import { decideMasteryProgression } from "../domain/training/engine/plan-progression";
import { requireAbilityStage } from "../domain/training/engine/progression-model";
import { ArtifactBuildError } from "../domain/training/orchestration/agent-runtime";
import { createNextUnit } from "../domain/training/unit-creation/create-next-unit";
import { runPrepareUnit } from "../domain/training/unit-preparation/prepare-unit-edge";
import { buildProjectCheckpointRepository } from "./build-project-checkpoint-repository";
import { buildProjectCurriculumRepository } from "./build-project-curriculum-repository";
import { buildProjectProfileRepository } from "./build-project-profile-repository";
import { memoryRepository } from "./memory-repository";
import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { trainingOnboardingRepository } from "./training-onboarding-repository";
import {
  advanceSkillMapNode,
  createUnitCreationRepositoryDeps,
  ensureSkillKnowledge,
  loadProgressionState,
} from "./unit-creation-repository-deps";
import { createUnitPreparationRepositoryDeps } from "./unit-preparation-repository-deps";

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

export const recoverSkillUnits = async ({
  db,
  sessionId,
  userId,
  scheduleBackgroundTask,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
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
  // The recoverable frontier: ready skills and abilities with an open skillset
  // stage. Planned-but-locked nodes are the progression engine's to open.
  const skills = rawNodes.filter((node) => {
    if (node.status !== "ready" || node.skillMap == null) return false;
    if (node.kind === "skill") return true;
    if (node.kind !== "ability") return false;
    return requireAbilityStage(node.abilityStage) === "skillset";
  });

  const recoverSkill = async (node: {
    id: string;
    kind: string;
    parentNodeId: string | null;
  }) => {
    const skillNodeId = node.id;
    // Abilities own no knowledge map; their skillset units aggregate the child
    // skills' knowledge items at unit-creation time.
    if (node.kind !== "ability") {
      const knowledge = await ensureSkillKnowledge({
        db,
        skillNodeId,
        targetIdentity: plan.targetIdentity,
      });
      if (!knowledge) return;
    }
    const state = await loadProgressionState({ db, skillNodeId, userId });
    if (!state) return;
    const decision = decideMasteryProgression(state);
    if (decision.intent === "create_unit") {
      await ensureSkillUnit({ db, skillNodeId, sessionId, userId });
    } else {
      await advanceSkillMapNode({ db, nodeId: skillNodeId, sessionId, userId });
    }
  };

  // Recovery may run knowledge generation (a slow AI call) per skill. Only the
  // earliest incomplete skill — the one Continue is about to enter — is
  // recovered synchronously; the rest are healed off the request path.
  const [firstSkill, ...remainingSkills] = skills;
  if (!firstSkill) return;
  try {
    await recoverSkill(firstSkill);
  } catch (error) {
    console.error("Skill unit recovery failed", {
      skillNodeId: firstSkill.id,
      error,
    });
  }
  if (remainingSkills.length === 0) return;
  const recoverRemaining = async () => {
    await Promise.allSettled(
      remainingSkills.map((skill) => recoverSkill(skill)),
    );
  };
  if (scheduleBackgroundTask) {
    scheduleBackgroundTask(recoverRemaining);
  } else {
    await recoverRemaining();
  }
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

  heartbeatRun: (payload) =>
    buildProjectCheckpointRepository.heartbeatRun({ db, ...payload }),

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
    userId,
    title,
    summary,
    targetIdentity,
    seedRating,
  }) => {
    const plan = await buildProjectCurriculumRepository.upsertPlanShell({
      db,
      sessionId,
      userId,
      title,
      summary,
      targetIdentity,
      seedRating,
    });
    return { id: plan.id };
  },

  persistCurriculum: async ({
    sessionId,
    userId,
    planId,
    report,
    blueprint,
  }) => {
    await db.transaction(async (tx) => {
      const dbTx = tx as unknown as Database;
      const profile = await buildProjectProfileRepository.upsertProfileVersion({
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
  ensureSkillKnowledge: (input) => ensureSkillKnowledge({ db, ...input }),
  createSkillUnit: ({ skillNodeId, sessionId, userId }) =>
    ensureSkillUnit({ db, skillNodeId, sessionId, userId }),
});
