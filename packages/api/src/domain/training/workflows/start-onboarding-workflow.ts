import type { CurriculumMode } from "@acme/validators";

import type { Result } from "../../../lib/result";
import type { OnboardingSessionState } from "../types/training.types";
import { err, ok } from "../../../lib/result";
import { TOPIC_SCOPE_CONSULTANT_OPENER } from "../prompts/personas/topic-scope-consultant";
import { INTRO_PROMPT } from "../services/onboarding-prompts";

/** Each consultant opens with its own question; the transcript starts there. */
const openerFor = (mode: CurriculumMode): string =>
  mode === "topic" ? TOPIC_SCOPE_CONSULTANT_OPENER : INTRO_PROMPT;

interface StartOnboardingDependencies {
  createSession: (input: {
    userId?: string | null;
    curriculumMode: CurriculumMode;
  }) => Promise<{ id: string } | null>;
  appendMessage: (input: {
    sessionId: string;
    role: "assistant" | "user";
    content: string;
    slot: string | null;
  }) => Promise<unknown>;
}

export const startOnboardingWorkflow = async ({
  userId,
  curriculumMode = "topic",
  deps,
}: {
  userId?: string | null;
  /** Fixed for the life of the session — the two modes run different consultants. */
  curriculumMode?: CurriculumMode;
  deps: StartOnboardingDependencies;
}): Promise<Result<OnboardingSessionState>> => {
  const session = await deps.createSession({ userId, curriculumMode });
  if (!session) {
    return err("Failed to start onboarding.");
  }

  const opener = openerFor(curriculumMode);
  await deps.appendMessage({
    sessionId: session.id,
    role: "assistant",
    content: opener,
    slot: "target_identity",
  });

  return ok({
    sessionId: session.id,
    phase: "intro",
    transcript: [
      {
        role: "assistant",
        content: opener,
        sequence: 0,
        slot: "target_identity",
      },
    ],
    activeQuestion: null,
  });
};
