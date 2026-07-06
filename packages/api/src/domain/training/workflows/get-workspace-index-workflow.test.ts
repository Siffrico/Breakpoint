import { describe, expect, it } from "vitest";

import { getWorkspaceIndexWorkflow } from "./get-workspace-index-workflow";

describe("getWorkspaceIndexWorkflow", () => {
  it("returns only message-backed chats, newest first", async () => {
    const result = await getWorkspaceIndexWorkflow({
      deps: {
        listSessionsByUser: async () => [
          {
            id: "session-1",
            status: "complete",
            createdAt: new Date(),
            updatedAt: null,
          },
        ],
        listProfilesBySessionIds: async () => [],
        listPlansBySessionIds: async () => [
          {
            id: "plan-1",
            onboardingSessionId: "session-1",
            title: "Distributed systems",
            status: "active",
          },
        ],
        listFirstUserMessagesBySessionIds: async () => [],
        listChatUnitIdsBySessionIds: async () => [
          { sessionId: "session-1", unitId: "older-chat" },
          { sessionId: "session-1", unitId: "newer-chat" },
        ],
        listNodesByPlanIds: async () => [
          {
            id: "planned-only",
            planId: "plan-1",
            kind: "unit",
            status: "planned",
            title: "Not a chat",
            orderIndex: 3,
          },
          {
            id: "older-chat",
            planId: "plan-1",
            kind: "unit",
            status: "completed",
            title: "Older chat",
            orderIndex: 1,
          },
          {
            id: "newer-chat",
            planId: "plan-1",
            kind: "unit",
            status: "ready",
            title: "Newer chat",
            orderIndex: 2,
          },
        ],
      },
    });

    expect(result).toEqual([
      {
        sessionId: "session-1",
        title: "Distributed systems",
        chats: [
          { id: "newer-chat", title: "Newer chat" },
          { id: "older-chat", title: "Older chat" },
        ],
      },
    ]);
  });
});
