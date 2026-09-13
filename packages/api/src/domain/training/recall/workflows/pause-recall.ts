import { Effect } from "effect";

import { projectRecallTask, RecallRepo } from "../recall-repo";

export const pauseRecallWorkflow = (input: {
  readonly userId: string;
  readonly taskId: string;
  readonly now: Date;
}) =>
  Effect.gen(function* () {
    const repo = yield* RecallRepo;
    return projectRecallTask(yield* repo.pauseTask(input));
  });
