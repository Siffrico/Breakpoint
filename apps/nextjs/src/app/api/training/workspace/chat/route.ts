import type { NextRequest } from "next/server";

import { streamWorkspaceChat } from "@acme/api/workspace-chat";
import { db } from "@acme/db/client";
import { AiModelPreferenceSchema } from "@acme/validators";

import { auth } from "~/auth/server";

export const runtime = "nodejs";

interface WorkspaceChatRequestBody {
  message?: string;
  model?: string;
  sessionId?: string;
}

const AI_MODEL_COOKIE = "bp-ai-model";

const resolveModelPreference = (req: NextRequest, model?: string) => {
  const parsed = AiModelPreferenceSchema.safeParse(
    model ?? req.cookies.get(AI_MODEL_COOKIE)?.value,
  );

  return parsed.success ? parsed.data : null;
};

export const POST = async (req: NextRequest) => {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: WorkspaceChatRequestBody;
  try {
    body = (await req.json()) as WorkspaceChatRequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { sessionId, message } = body;
  if (
    !sessionId ||
    typeof sessionId !== "string" ||
    !message ||
    typeof message !== "string"
  ) {
    return new Response("Invalid request body", { status: 400 });
  }

  return streamWorkspaceChat({
    db,
    sessionId,
    userId: session.user.id,
    message,
    modelName: resolveModelPreference(req, body.model),
  });
};
