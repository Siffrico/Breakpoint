import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ONBOARDING_CHAT_BODY_MAX_BYTES,
  ONBOARDING_CHAT_MAX_MESSAGES,
} from "@acme/validators";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  streamOnboardingChat: vi.fn(),
  streamProjectBuildResume: vi.fn(),
}));

vi.mock("~/auth/server", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("@acme/api/onboarding-chat", () => ({
  streamOnboardingChat: mocks.streamOnboardingChat,
  streamProjectBuildResume: mocks.streamProjectBuildResume,
}));
vi.mock("@acme/db/client", () => ({ db: {} }));

const session = { user: { id: "user-1" } };
const validBody = {
  messages: [
    {
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text: "I want to learn product design." }],
    },
  ],
  sessionId: "00000000-0000-4000-8000-000000000001",
};
const request = (body: string) =>
  new NextRequest("http://localhost/api/onboarding/chat", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });

describe("onboarding chat route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.streamOnboardingChat.mockResolvedValue(new Response("stream"));
  });

  it("does not enter onboarding for invalid JSON", async () => {
    mocks.getSession.mockResolvedValue(session);

    const response = await POST(request("{"));

    expect(response.status).toBe(400);
    expect(mocks.streamOnboardingChat).not.toHaveBeenCalled();
  });

  it("does not enter onboarding for an unauthenticated request", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify(validBody)));

    expect(response.status).toBe(401);
    expect(mocks.streamOnboardingChat).not.toHaveBeenCalled();
  });

  it("passes only Zod-validated authenticated input to onboarding", async () => {
    mocks.getSession.mockResolvedValue(session);

    await POST(request(JSON.stringify(validBody)));

    expect(mocks.streamOnboardingChat).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: validBody.sessionId,
        userId: session.user.id,
        messages: validBody.messages,
      }),
    );
  });

  it("rejects an oversized body before entering onboarding", async () => {
    mocks.getSession.mockResolvedValue(session);
    const oversized = JSON.stringify({
      ...validBody,
      padding: "x".repeat(ONBOARDING_CHAT_BODY_MAX_BYTES),
    });

    const response = await POST(request(oversized));

    expect(response.status).toBe(413);
    expect(mocks.streamOnboardingChat).not.toHaveBeenCalled();
  });

  it("rejects a history over the message-count cap", async () => {
    mocks.getSession.mockResolvedValue(session);
    const response = await POST(
      request(
        JSON.stringify({
          ...validBody,
          messages: Array.from(
            { length: ONBOARDING_CHAT_MAX_MESSAGES + 1 },
            () => validBody.messages[0],
          ),
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.streamOnboardingChat).not.toHaveBeenCalled();
  });
});
