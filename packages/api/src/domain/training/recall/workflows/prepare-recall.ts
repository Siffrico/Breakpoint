import { randomUUID } from "node:crypto";
import { Effect } from "effect";

import { generateRecallScenario } from "../model";
import { RecallRepo } from "../recall-repo";

export const prepareRecallWorkflow = (input: {
  readonly userId: string;
  readonly sessionId: string;
  readonly planId: string;
  readonly now: Date;
}) =>
  Effect.gen(function* () {
    const repo = yield* RecallRepo;
    const reserved = yield* repo.reserveDueTask({
      ...input,
      leaseId: randomUUID(),
    });
    if (!reserved) return { status: "not_needed" as const };

    const scenario = yield* generateRecallScenario({
      snapshot: reserved.task.knowledgeSnapshot,
      previousChallenges: reserved.previousChallenges,
    });
    const saved = yield* repo.savePreparedScenario({
      taskId: reserved.task.id,
      leaseId: reserved.preparationLeaseId,
      scenario,
      interactionId: randomUUID(),
    });
    return saved
      ? { status: "ready" as const, taskId: reserved.task.id }
      : { status: "lease_lost" as const };
  });
