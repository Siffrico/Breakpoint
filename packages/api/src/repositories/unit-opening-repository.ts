import { Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import type { UnitPreparedStep } from "@acme/validators";
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
import { runMentorLessonAgent } from "../domain/training/education-unit/mentor-agent";
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
    const draft = current?.cursor.prepared?.draft;
    return {
      kind: "unopened",
      opening:
        draft?.kind === "lesson" && draft.inputKey
          ? { key: draft.inputKey, assistantMessage: draft.lesson }
          : null,
    };
  };

  return prepareOpening(teaching, {
    load,
    teach: runMentorLessonAgent,
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
              const prepared: UnitPreparedStep = {
                interactionId: run.cursor.interactionId,
                draft: {
                  kind: "lesson",
                  inputKey: opening.key,
                  lesson: opening.assistantMessage,
                },
              };
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
                  cursorJson: { ...run.cursor, prepared },
                  difficultySnapshotJson: run.difficultySnapshot,
                })
                .onConflictDoNothing();
              await leaseDb
                .update(TrainingUnitRun)
                .set({
                  cursorJson: sql`jsonb_set(${TrainingUnitRun.cursorJson}, '{prepared}', ${JSON.stringify(prepared)}::jsonb)`,
                })
                .where(
                  and(
                    eq(TrainingUnitRun.sessionId, run.sessionId),
                    eq(TrainingUnitRun.unitContentId, run.unitId),
                    eq(TrainingUnitRun.kind, run.kind),
                    sql`${TrainingUnitRun.cursorJson}->>'interactionId' = ${run.cursor.interactionId}`,
                    sql`jsonb_array_length(${TrainingUnitRun.cursorJson}->'steps') = 0`,
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
      },
    });
  });
