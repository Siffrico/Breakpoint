import type { UIMessage } from "ai";
import type { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod/v4";

import { streamMissionChat } from "@acme/api/mission-chat";
import { db } from "@acme/db/client";
import { AiModelPreferenceSchema } from "@acme/validators";

import { requireSession } from "~/app/api/_lib/require-session";

export const runtime = "nodejs";
export const maxDuration = 300;
const BodySchema = z.object({
  unitRunId: z.string().uuid(),
  messages: z.array(z.unknown()),
  model: z.string().optional(),
});

export const POST = async (req: NextRequest) => {
  const session = await requireSession(req);
  if (!session) return new Response("Unauthorized", { status: 401 });
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return new Response("Invalid request body", { status: 400 });
  const model = AiModelPreferenceSchema.safeParse(
    parsed.data.model ?? req.cookies.get("bp-ai-model")?.value,
  );
  return streamMissionChat({
    db,
    userId: session.user.id,
    unitRunId: parsed.data.unitRunId,
    messages: parsed.data.messages as UIMessage[],
    modelName: model.success ? model.data : null,
    scheduleBackgroundTask: (task) => after(task),
  });
};
