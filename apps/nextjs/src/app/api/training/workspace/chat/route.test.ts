import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  streamWorkspaceChat: vi.fn(),
}));

vi.mock("~/app/api/_lib/require-session", () => ({
  requireSession: mocks.requireSession,
}));
vi.mock("@acme/api/workspace-chat", () => ({
  streamWorkspaceChat: mocks.streamWorkspaceChat,
}));
vi.mock("@acme/db/client", () => ({ db: {} }));

const session = { user: { id: "user-1" } };
const validBody = {
  message: "Here is my diagnosis.",
  sessionId: "00000000-0000-0000-0000-000000000001",
  turnId: "turn-1",
};
const request = (body: string) =>
  new NextRequest("http://localhost/api/training/workspace/chat", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });

describe("workspace chat route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.streamWorkspaceChat.mockResolvedValue(new Response("stream"));
  });

  it("does not enter the workspace boundary for invalid JSON", async () => {
    mocks.requireSession.mockResolvedValue(session);

    const response = await POST(request("{"));

    expect(response.status).toBe(400);
    expect(mocks.streamWorkspaceChat).not.toHaveBeenCalled();
  });

  it("does not enter the workspace boundary for an unauthenticated request", async () => {
    mocks.requireSession.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify(validBody)));

    expect(response.status).toBe(401);
    expect(mocks.streamWorkspaceChat).not.toHaveBeenCalled();
  });

  it("passes only validated authenticated input to the workspace boundary", async () => {
    mocks.requireSession.mockResolvedValue(session);

    await POST(request(JSON.stringify(validBody)));

    expect(mocks.streamWorkspaceChat).toHaveBeenCalledOnce();
    expect(mocks.streamWorkspaceChat).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: validBody.sessionId,
        turnId: validBody.turnId,
        userId: session.user.id,
        message: validBody.message,
      }),
    );
  });
});
