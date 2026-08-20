import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MISSION_CHAT_BODY_MAX_BYTES,
  MISSION_CHAT_MAX_MESSAGES,
  MISSION_CHAT_MESSAGE_MAX_CHARS,
} from "@acme/validators";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  streamMissionChat: vi.fn(),
}));

vi.mock("~/app/api/_lib/require-session", () => ({
  requireSession: mocks.requireSession,
}));
vi.mock("@acme/api/mission-chat", () => ({
  streamMissionChat: mocks.streamMissionChat,
}));
vi.mock("@acme/db/client", () => ({ db: {} }));

const session = { user: { id: "user-1" } };
const message = {
  id: "message-1",
  role: "user",
  parts: [{ type: "text", text: "Help me plan the mission." }],
};
const validBody = {
  unitRunId: "00000000-0000-4000-8000-000000000001",
  messages: [message],
};
const request = (body: string) =>
  new NextRequest("http://localhost/api/mission/chat", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });

describe("mission chat route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.streamMissionChat.mockResolvedValue(new Response("stream"));
  });

  it("passes only validated authenticated input to mission chat", async () => {
    mocks.requireSession.mockResolvedValue(session);

    await POST(request(JSON.stringify(validBody)));

    expect(mocks.streamMissionChat).toHaveBeenCalledWith(
      expect.objectContaining({
        unitRunId: validBody.unitRunId,
        messages: validBody.messages,
        userId: session.user.id,
      }),
    );
  });

  it("rejects an oversized body before entering mission chat", async () => {
    mocks.requireSession.mockResolvedValue(session);
    const response = await POST(
      request(
        JSON.stringify({
          ...validBody,
          padding: "x".repeat(MISSION_CHAT_BODY_MAX_BYTES),
        }),
      ),
    );

    expect(response.status).toBe(413);
    expect(mocks.streamMissionChat).not.toHaveBeenCalled();
  });

  it("rejects a history over the message-count cap", async () => {
    mocks.requireSession.mockResolvedValue(session);
    const response = await POST(
      request(
        JSON.stringify({
          ...validBody,
          messages: Array.from(
            { length: MISSION_CHAT_MAX_MESSAGES + 1 },
            (_, index) => ({ ...message, id: `message-${index}` }),
          ),
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.streamMissionChat).not.toHaveBeenCalled();
  });

  it("rejects a message over the character cap", async () => {
    mocks.requireSession.mockResolvedValue(session);
    const response = await POST(
      request(
        JSON.stringify({
          ...validBody,
          messages: [
            {
              ...message,
              parts: [
                {
                  type: "text",
                  text: "x".repeat(MISSION_CHAT_MESSAGE_MAX_CHARS + 1),
                },
              ],
            },
          ],
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.streamMissionChat).not.toHaveBeenCalled();
  });

  it("rejects a combined history over the character cap", async () => {
    mocks.requireSession.mockResolvedValue(session);
    const response = await POST(
      request(
        JSON.stringify({
          ...validBody,
          messages: Array.from({ length: 3 }, (_, index) => ({
            ...message,
            id: `message-${index}`,
            parts: [{ type: "text", text: "x".repeat(11_000) }],
          })),
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.streamMissionChat).not.toHaveBeenCalled();
  });
});
