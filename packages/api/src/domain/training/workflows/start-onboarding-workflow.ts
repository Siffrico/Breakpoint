import type { Result } from "../../../lib/result";
import type { OnboardingSessionState } from "../types/training.types";
import { err, ok } from "../../../lib/result";
import { TOPIC_SCOPE_CONSULTANT_OPENER } from "../prompts/personas/topic-scope-consultant";

interface StartOnboardingDependencies {
  createSession: (input: {
    userId?: string | null;
  }) => Promise<{ id: string } | null>;
  appendMessage: (input: {
    sessionId: string;
    role: "assistant";
    content: string;
  }) => Promise<unknown>;
}

export const startOnboardingWorkflow = async ({
  userId,
  deps,
}: {
  userId?: string | null;
  deps: StartOnboardingDependencies;
}): Promise<Result<OnboardingSessionState>> => {
  const session = await deps.createSession({ userId });
  if (!session) return err("Failed to start onboarding.");

  await deps.appendMessage({
    sessionId: session.id,
    role: "assistant",
    content: TOPIC_SCOPE_CONSULTANT_OPENER,
  });

  return ok({
    sessionId: session.id,
    phase: "intro",
    transcript: [
      {
        role: "assistant",
        content: TOPIC_SCOPE_CONSULTANT_OPENER,
        sequence: 0,
        slot: null,
      },
    ],
    activeQuestion: null,
  });
};
