import { Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import { StartingPointTierSchema } from "@acme/validators";

import type { BuildProjectDeps } from "../domain/training/orchestration/build-project";
import { designSyllabus } from "../domain/training/agents/syllabus-designer";
import { decideMasteryProgression } from "../domain/training/engine/plan-progression";
import { parseAbilityStage } from "../domain/training/engine/progression-model";
import { ArtifactBuildError } from "../domain/training/orchestration/agent-runtime";
import { createNextUnit } from "../domain/training/unit-creation/create-next-unit";
import { runPrepareUnit } from "../domain/training/unit-preparation/prepare-unit-edge";
import { buildProjectCheckpointRepository } from "./build-project-checkpoint-repository";
import { buildProjectCurriculumRepository } from "./build-project-curriculum-repository";
import { buildProjectProfileRepository } from "./build-project-profile-repository";
import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { trainingOnboardingRepository } from "./training-onboarding-repository";
import { trainingSyllabusRepository } from "./training-syllabus-repository";
import {
  advanceSkillMapNode,
  createUnitCreationRepositoryDeps,
  loadProgressionState,
} from "./unit-creation-repository-deps";
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
  Effect.runPromise(
    createNextUnit({
      clusterNodeId,
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

  // The recoverable frontier: every non-completed, ready skillMap node —
  // v2 `skill` nodes (foundation units), `ability` nodes whose skillset climb
  // has opened, and legacy `skill_cluster`s. Planned-but-locked nodes are the
  // progression engine's to open, not recovery's. An ability's `ready` status
  // only means its track is visible; whether its skillset climb is open is an
  // explicit stage the advancement engine records. Rows that predate the
  // stage column fall back to deriving it from child-skill completion.
  const skills = rawNodes.filter((node) => {
    if (node.status !== "ready" || node.skillMap == null) return false;
    if (node.kind === "skill" || node.kind === "skill_cluster") return true;
    if (node.kind !== "ability") return false;
    const stage = parseAbilityStage(node.abilityStage);
    if (stage) return stage === "skillset";
    const childSkills = rawNodes.filter(
      (child) => child.kind === "skill" && child.parentNodeId === node.id,
    );
    return (
      childSkills.length > 0 &&
      childSkills.every((child) => child.status === "completed")
    );
  });

  const recoverSkill = async (clusterNodeId: string, kind: string) => {
    // Abilities own no syllabus — their skillset units aggregate the child
    // skills' concept maps at unit-creation time.
    if (kind !== "ability") {
      const syllabus = await ensureSkillSyllabus({
        db,
        clusterNodeId,
        targetIdentity: plan.targetIdentity,
      });
      if (!syllabus) return;
    }
    const state = await loadProgressionState({ db, clusterNodeId, userId });
    if (!state) return;
    const decision = decideMasteryProgression(state);
    if (decision.intent === "create_unit") {
      await ensureSkillUnit({ db, clusterNodeId, sessionId, userId });
    } else {
      await advanceSkillMapNode({ db, nodeId: clusterNodeId, sessionId, userId });
    }
  };

  // Recovery may run syllabus generation (a slow AI call) per skill. Only the
  // earliest incomplete skill — the one Continue is about to enter — is
  // recovered synchronously; the rest are healed off the request path.
  const [firstSkill, ...remainingSkills] = skills;
  if (!firstSkill) return;
  try {
    await recoverSkill(firstSkill.id, firstSkill.kind);
  } catch (error) {
    console.error("Skill unit recovery failed", {
      clusterNodeId: firstSkill.id,
      error,
    });
  }
  if (remainingSkills.length === 0) return;
  const recoverRemaining = async () => {
    await Promise.allSettled(
      remainingSkills.map((skill) => recoverSkill(skill.id, skill.kind)),
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
  createSkillUnit: ({ clusterNodeId, sessionId, userId }) =>
    ensureSkillUnit({ db, clusterNodeId, sessionId, userId }),
});
