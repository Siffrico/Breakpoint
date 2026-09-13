import { randomUUID } from "node:crypto";
import { Effect } from "effect";

import { projectRecallTask, RecallRepo } from "../recall-repo";

export const getRecallOfferWorkflow = (input: {
  readonly userId: string;
  readonly sessionId: string;
  readonly planId: string;
  readonly boundaryNodeId: string | null;
}) =>
  Effect.gen(function* () {
    const repo = yield* RecallRepo;
    let task = yield* repo.getActiveTask(input);
    const reservation =
      !task || task.state === "preparing"
        ? yield* repo.reserveDueTask({
            userId: input.userId,
            sessionId: input.sessionId,
            planId: input.planId,
            now: new Date(),
            leaseId: randomUUID(),
          })
        : null;
    if (reservation) {
      return { offer: { status: "preparing" as const }, reservation };
    }
    if (!task || task.state === "preparing") {
      task = yield* repo.getActiveTask(input);
    }
    const offer = !task
      ? { status: "none" as const }
      : task.state === "preparing"
        ? { status: "preparing" as const }
        : { status: "ready" as const, task: projectRecallTask(task) };
    return { offer, reservation: null };
  });
