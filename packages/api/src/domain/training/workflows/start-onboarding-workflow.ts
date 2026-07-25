import type { Result } from "../../../lib/result";
import type { OnboardingSessionState } from "../types/training.types";
import { err, ok } from "../../../lib/result";
import { INTRO_PROMPT } from "../services/onboarding-prompts";

interface StartOnboardingDependencies {
  createSession: (userId?: string | null) => Promise<{ id: string } | null>;
  appendMessage: (input: {
    sessionId: string;
    role: "assistant" | "user";
    content: string;
    slot: string | null;
  }) => Promise<unknown>;
}

export const startOnboardingWorkflow = async ({
  userId,
  deps,
}: {
  userId?: string | null;
  deps: StartOnboardingDependencies;
}): Promise<Result<OnboardingSessionState>> => {
  const session = await deps.createSession(userId);
  if (!session) {
    return err("Failed to start onboarding.");
  }

  await deps.appendMessage({
    sessionId: session.id,
    role: "assistant",
    content: INTRO_PROMPT,
    slot: "target_identity",
  });

  return ok({
    sessionId: session.id,
    phase: "intro",
    transcript: [
      {
        role: "assistant",
        content: INTRO_PROMPT,
        sequence: 0,
        slot: "target_identity",
      },
    ],
    activeQuestion: null,
  });
};
