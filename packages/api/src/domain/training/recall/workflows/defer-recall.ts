import { Effect } from "effect";

import { projectRecallTask, RecallRepo } from "../recall-repo";

export const deferRecallWorkflow = (input: {
  readonly userId: string;
  readonly taskId: string;
  readonly boundaryNodeId: string | null;
  readonly now: Date;
}) =>
  Effect.gen(function* () {
    const repo = yield* RecallRepo;
    return projectRecallTask(yield* repo.deferTask(input));
  });
