import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  WORKSPACE_CHAT_BODY_MAX_BYTES,
  WORKSPACE_CHAT_MESSAGE_MAX_CHARS,
} from "@acme/validators";

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
  interactionId: "education:session-1:unit-1:initial",
  message: "Here is my diagnosis.",
  sessionId: "00000000-0000-4000-8000-000000000001",
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
        interactionId: validBody.interactionId,
        turnId: validBody.turnId,
        userId: session.user.id,
        message: validBody.message,
        requestStartedAt: expect.any(Number) as unknown as number,
      }),
    );
  });

  it("rejects an answer that does not identify the active interaction", async () => {
    mocks.requireSession.mockResolvedValue(session);
    const body = {
      message: validBody.message,
      sessionId: validBody.sessionId,
      turnId: validBody.turnId,
    };

    const response = await POST(request(JSON.stringify(body)));

    expect(response.status).toBe(400);
    expect(mocks.streamWorkspaceChat).not.toHaveBeenCalled();
  });

  it("rejects an oversized body before entering the workspace boundary", async () => {
    mocks.requireSession.mockResolvedValue(session);
    const oversized = JSON.stringify({
      ...validBody,
      padding: "x".repeat(WORKSPACE_CHAT_BODY_MAX_BYTES),
    });

    const response = await POST(request(oversized));

    expect(response.status).toBe(413);
    expect(mocks.streamWorkspaceChat).not.toHaveBeenCalled();
  });

  it("rejects a submitted answer over the shared character cap", async () => {
    mocks.requireSession.mockResolvedValue(session);
    const response = await POST(
      request(
        JSON.stringify({
          ...validBody,
          message: "x".repeat(WORKSPACE_CHAT_MESSAGE_MAX_CHARS + 1),
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.streamWorkspaceChat).not.toHaveBeenCalled();
  });

  it("rejects combined text parts over the shared character cap", async () => {
    mocks.requireSession.mockResolvedValue(session);
    const half = Math.floor(WORKSPACE_CHAT_MESSAGE_MAX_CHARS / 2) + 1;
    const response = await POST(
      request(
        JSON.stringify({
          interactionId: validBody.interactionId,
          sessionId: validBody.sessionId,
          turnId: validBody.turnId,
          messages: [
            {
              id: "message-1",
              role: "user",
              parts: [
                { type: "text", text: "x".repeat(half) },
                { type: "text", text: "y".repeat(half) },
              ],
            },
          ],
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.streamWorkspaceChat).not.toHaveBeenCalled();
  });
});
