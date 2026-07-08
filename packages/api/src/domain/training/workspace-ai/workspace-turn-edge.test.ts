import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { DbError } from "../../../effect/errors";
import { AgentTimeoutError } from "../education-unit/agents/errors";
import {
  TurnLeaseConflictError,
  WorkspaceInputError,
} from "./workspace-errors";
import { runWorkspaceTurn } from "./workspace-turn-edge";

describe("runWorkspaceTurn", () => {
  it.each([
    [
      new WorkspaceInputError({ message: "Write a fuller answer." }),
      "BAD_REQUEST",
      "Write a fuller answer.",
    ],
    [
      new TurnLeaseConflictError({ message: "Turn is already processing." }),
      "CONFLICT",
      "Turn is already processing.",
    ],
    [
      new AgentTimeoutError({ message: "provider timed out" }),
      "TIMEOUT",
      "AI feedback could not be prepared.",
    ],
  ] as const)(
    "translates %s once at the edge",
    async (failure, code, message) => {
      await expect(
        runWorkspaceTurn(Effect.fail(failure)),
      ).rejects.toMatchObject({
        code,
        message,
      });
    },
  );

  it("retains a classified database failure as the tRPC cause", async () => {
    const failure = new DbError({
      message: "Database operation failed: commitEducationTurn",
      operation: "commitEducationTurn",
      sqlState: "40001",
      kind: "serialization",
    });

    await expect(runWorkspaceTurn(Effect.fail(failure))).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "AI feedback could not be prepared.",
      cause: failure,
    });
  });
});
