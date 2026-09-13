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
    const task = yield* repo.getOfferableTask(input);
    return task ? projectRecallTask(task) : null;
  });
