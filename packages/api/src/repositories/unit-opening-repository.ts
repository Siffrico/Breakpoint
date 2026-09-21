import { Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import { and, eq, sql } from "@acme/db";
import { TrainingUnitRun } from "@acme/db/schema";

import type {
  OpeningLookup,
  OpeningTeachingInput,
} from "../domain/training/education-unit/prepare-opening";
import type { PersistedUnitRun } from "../domain/training/education-unit/unit-state";
import type { UnitContent } from "../domain/training/types/training.types";
import {
  DEFAULT_EDUCATION_EXPERIENCE,
  resolveEducationExperience,
} from "../domain/training/education-unit/experience";
import { runMentorTeachingAgent } from "../domain/training/education-unit/mentor-agent";
import { prepareOpening } from "../domain/training/education-unit/prepare-opening";
import { createMentorContext } from "../domain/training/education-unit/unit-context";
import {
  createUnitRun,
  isUnitUnopened,
} from "../domain/training/education-unit/unit-state";
import { UnitPersistError } from "../domain/training/unit-preparation/errors";
import { withNodeBuildLifecycle } from "./node-build-lifecycle";
import { resolveClusterDirective } from "./resolve-cluster-directive";
import { trainingUnitRunRepository } from "./training-unit-run-repository";
import { createWorkspaceTurnRepositoryDeps } from "./workspace-turn-repository-deps";

type Database = typeof databaseClient;

export const prepareUnitOpening = ({
  db,
  nodeId,
  run,
  teaching,
}: {
  db: Database;
  nodeId: string;
  run: PersistedUnitRun;
  teaching: OpeningTeachingInput;
}) => {
  const load = async (): Promise<OpeningLookup> => {
    const current = await trainingUnitRunRepository.getUnitRun({
      db,
      sessionId: run.sessionId,
      unitContentId: run.unitId,
    });
    if (current && current.cursor.interactionId !== run.cursor.interactionId) {
      return { kind: "started" };
    }
    return {
      kind: "unopened",
      opening: current?.cursor.preparedOpening ?? null,
    };
  };

  return prepareOpening(teaching, {
    load,
    teach: runMentorTeachingAgent,
    withLock: (build, loadReady) =>
      withNodeBuildLifecycle({
        db,
        kind: "unit_opening",
        nodeId,
        rebuildReady: true,
        loadReady,
        build: (_buildDb, withLease) =>
          build((opening) =>
            withLease(async (leaseDb) => {
              await leaseDb
                .insert(TrainingUnitRun)
                .values({
                  sessionId: run.sessionId,
                  unitContentId: run.unitId,
                  userId: run.userId,
                  kind: run.kind,
                  experienceId: run.experience.id,
                  experienceVersion: run.experience.version,
                  experienceJson: run.experience,
                  unitContextJson: run.unitContext,
                  cursorJson: { ...run.cursor, preparedOpening: opening },
                  difficultySnapshotJson: run.difficultySnapshot,
                })
                .onConflictDoNothing();
              await leaseDb
                .update(TrainingUnitRun)
                .set({
                  cursorJson: sql`jsonb_set(${TrainingUnitRun.cursorJson}, '{preparedOpening}', ${JSON.stringify(opening)}::jsonb)`,
                })
                .where(
                  and(
                    eq(TrainingUnitRun.sessionId, run.sessionId),
                    eq(TrainingUnitRun.unitContentId, run.unitId),
                    eq(TrainingUnitRun.kind, run.kind),
                    sql`${TrainingUnitRun.cursorJson}->>'interactionId' = ${run.cursor.interactionId}`,
                    sql`${TrainingUnitRun.cursorJson}->'step'->>'kind' = 'teaching'`,
                  ),
                );
            }),
          ),
      }),
  });
};

export const warmUnitOpening = ({
  db,
  unit,
  parentNodeId,
  sessionId,
  userId,
}: {
  db: Database;
  unit: UnitContent;
  parentNodeId: string;
  sessionId: string;
  userId: string;
}) =>
  Effect.gen(function* () {
    const deps = createWorkspaceTurnRepositoryDeps(db, userId);
    const prepared = yield* Effect.tryPromise({
      try: async () => {
        const [existing, experience, memories, difficulty] = await Promise.all([
          trainingUnitRunRepository.getUnitRun({
            db,
            sessionId,
            unitContentId: unit.id,
          }),
          deps.getEducationExperience?.() ??
            Promise.resolve(DEFAULT_EDUCATION_EXPERIENCE),
          deps.listMemories(userId),
          resolveClusterDirective({ db, userId, clusterNodeId: parentNodeId }),
        ]);
        if (!unit.unitContext) throw new Error("Unit context is missing.");
        const run =
          existing ??
          createUnitRun({
            unitId: unit.id,
            sessionId,
            userId,
            kind: "education",
            unitContext: unit.unitContext,
            experience,
          });
        if (!isUnitUnopened(run)) return null;
        return {
          run: {
            ...run,
            difficultySnapshot: run.difficultySnapshot ?? {
              nodeId: parentNodeId,
              ...difficulty,
            },
          },
          memories,
        };
      },
      catch: (cause) =>
        new UnitPersistError({
          message: "Introduction context could not be loaded.",
          cause,
        }),
    });
    if (!prepared) return;
    const { run, memories } = prepared;
    const experience = yield* resolveEducationExperience(run.experience);
    yield* prepareUnitOpening({
      db,
      nodeId: unit.nodeId,
      run,
      teaching: {
        context: createMentorContext({
          unitContext: run.unitContext,
          difficulty: run.difficultySnapshot,
          memories,
        }),
        experience,
        selectedResponse: run.difficultySnapshot.format?.kind === "mcq",
        testedCriterionIds: run.unitContext.judgment.criteria.map(
          (criterion) => criterion.id,
        ),
      },
    });
  });
