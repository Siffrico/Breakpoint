import type { NextRequest } from "next/server";
import type { UIMessage } from "ai";

import { streamOnboardingChat } from "@acme/api/onboarding-chat";
import { db } from "@acme/db/client";

import { auth } from "~/auth/server";

export const runtime = "nodejs";

interface ChatRequestBody {
  id?: string;
  messages?: UIMessage[];
  sessionId?: string;
}

export const POST = async (req: NextRequest) => {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { sessionId, messages } = body;
  if (!sessionId || typeof sessionId !== "string" || !Array.isArray(messages)) {
    return new Response("Invalid request body", { status: 400 });
  }

  return streamOnboardingChat({
    db,
    sessionId,
    userId: session.user.id,
    messages,
  });
};
