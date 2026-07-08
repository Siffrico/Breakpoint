import type { Effect } from "effect";
import { Context } from "effect";

import type { DbError } from "../../../effect/errors";
import type { WorkspaceAiMessage } from "./types";
import type { WorkspaceEducationTurnCommit } from "./workspace-turn-persistence";

export interface WorkspaceTurnRepoShape {
  readonly commitEducationTurn: (
    input: WorkspaceEducationTurnCommit,
  ) => Effect.Effect<{ assistantMessage: WorkspaceAiMessage }, DbError>;
}

export class WorkspaceTurnRepo extends Context.Service<
  WorkspaceTurnRepo,
  WorkspaceTurnRepoShape
>()("training/WorkspaceTurnRepo") {}
