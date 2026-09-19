import { pathToFileURL } from "node:url";
import { z } from "zod/v4";

import type { db as databaseClient } from "@acme/db/client";
import { eq, sql } from "@acme/db";
import { TrainingUnitRun } from "@acme/db/schema";
import {
  ScenarioEvaluationContractSchema,
  UnitContextSchema,
  UnitCursorSchema,
  UnitReviewChallengeSchema,
} from "@acme/validators";

const legacyChallengeSchema = UnitReviewChallengeSchema.extend({
  contract: ScenarioEvaluationContractSchema.extend({
    verifier: z.object({
      type: z.enum(["fixed_answer", "checker", "judge_rubric"]),
      answer: z.string().nullable(),
      checkerSpec: z.string().nullable(),
      scratchpad: z.string(),
    }),
  }),
});

export const migrateScenarioCursor = (
  storedCursor: unknown,
  storedContext: unknown,
) => {
  const cursor = z
    .object({
      step: z
        .object({
          kind: z.string(),
          challenge: z.unknown().optional(),
          preparedScenario: z.unknown().optional(),
        })
        .passthrough(),
    })
    .passthrough()
    .parse(storedCursor);
  const field =
    cursor.step.kind === "scenario" ? "challenge" : "preparedScenario";
  const parsed = legacyChallengeSchema.safeParse(cursor.step[field]);
  if (!parsed.success) return UnitCursorSchema.parse(storedCursor);

  const challenge = parsed.data;
  const legacy = challenge.contract.verifier;
  const context = UnitContextSchema.parse(storedContext);
  const answer = legacy.answer?.trim().toUpperCase();
  const verifier =
    legacy.type === "fixed_answer" &&
    legacy.checkerSpec === null &&
    answer &&
    /^[A-D]$/.test(answer)
      ? { kind: "fixed_answer", answer, scratchpad: legacy.scratchpad }
      : {
          kind: "checks",
          scratchpad: legacy.scratchpad,
          checks: challenge.contract.testedCriterionIds.map((criterionId) => {
            const criterion = context.judgment.criteria.find(
              (item) => item.id === criterionId,
            );
            if (!criterion)
              throw new Error(`No judgment criterion for ${criterionId}.`);
            return {
              criterionId,
              check: [criterion.criterion, legacy.answer, legacy.checkerSpec]
                .filter((part) => part !== null)
                .join("\n\n"),
            };
          }),
        };
  return UnitCursorSchema.parse({
    ...cursor,
    step: {
      ...cursor.step,
      [field]: { ...challenge, contract: { ...challenge.contract, verifier } },
    },
  });
};

// Run once before deploying check-based grading, with turn traffic stopped.
// From packages/api: pnpm exec tsx src/repositories/migrate-scenario-verifiers.ts
// POSTGRES_URL must be supplied by the migration operator.
export const migrateScenarioVerifiers = (db: typeof databaseClient) =>
  db.transaction(async (tx) => {
    await tx.execute(
      sql`LOCK TABLE becoming_unit_run IN SHARE ROW EXCLUSIVE MODE`,
    );
    const rows = await tx.query.TrainingUnitRun.findMany({
      where: sql`${TrainingUnitRun.cursorJson} #>> '{step,challenge,contract,verifier,type}' IS NOT NULL
        OR ${TrainingUnitRun.cursorJson} #>> '{step,preparedScenario,contract,verifier,type}' IS NOT NULL`,
    });
    const updates = rows.map((row) => {
      try {
        return {
          id: row.id,
          cursorJson: migrateScenarioCursor(
            row.cursorJson,
            row.unitContextJson,
          ),
        };
      } catch (cause) {
        throw new Error(
          `Cannot migrate scenario verifier for unit run ${row.id}.`,
          { cause },
        );
      }
    });
    for (const update of updates) {
      await tx
        .update(TrainingUnitRun)
        .set({ cursorJson: update.cursorJson })
        .where(eq(TrainingUnitRun.id, update.id));
    }
    return updates.length;
  });

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { db } = await import("@acme/db/client");
  try {
    console.log(
      `Migrated ${await migrateScenarioVerifiers(db)} saved scenario verifiers.`,
    );
  } finally {
    await db.$client.end();
  }
}
