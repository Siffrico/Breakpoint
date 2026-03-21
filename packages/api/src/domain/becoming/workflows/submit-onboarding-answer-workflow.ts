import { err, ok, type Result } from "../../../lib/result";
import { buildNextOnboardingStep } from "../services/build-next-onboarding-step";
import type { OnboardingSessionState } from "../types/becoming.types";

interface SubmitOnboardingAnswerDependencies {
  getSession: (sessionId: string) => Promise<{
    id: string;
    questionCount: number;
    status: string;
  } | null>;
  appendMessage: (input: {
    sessionId: string;
    role: "assistant" | "user";
    content: string;
    slot: string | null;
  }) => Promise<unknown>;
  updateSession: (input: {
    sessionId: string;
    status?: string;
    questionCount?: number;
    completedAt?: Date | null;
  }) => Promise<unknown>;
  listMessages: (sessionId: string) => Promise<OnboardingSessionState["transcript"]>;
}

export const submitOnboardingAnswerWorkflow = async ({
  sessionId,
  answer,
  deps,
}: {
  sessionId: string;
  answer: string;
  deps: SubmitOnboardingAnswerDependencies;
}): Promise<Result<OnboardingSessionState>> => {
  const session = await deps.getSession(sessionId);
  if (!session) {
    return err("Onboarding session does not exist.");
  }

  const trimmedAnswer = answer.trim();
  if (trimmedAnswer.length < 12) {
    return err("Write a more specific answer so the path can be built properly.");
  }

  const transcriptBeforeAnswer = await deps.listMessages(sessionId);
  const slot =
    transcriptBeforeAnswer
      .slice()
      .reverse()
      .find((message) => message.role === "assistant")?.slot ?? "target_identity";

  await deps.appendMessage({
    sessionId,
    role: "user",
    content: trimmedAnswer,
    slot,
  });

  const transcriptWithAnswer = await deps.listMessages(sessionId);

  let nextQuestion;
  try {
    nextQuestion = await buildNextOnboardingStep({
      transcript: transcriptWithAnswer,
      followUpCount: session.questionCount,
    });
  } catch (error) {
    return err(
      error instanceof Error
        ? error.message
        : "Failed to generate the next onboarding question.",
    );
  }

  if (!nextQuestion) {
    await deps.updateSession({
      sessionId,
      status: "ready_for_generation",
      completedAt: new Date(),
    });

    return ok({
      sessionId,
      phase: "ready_for_generation",
      transcript: transcriptWithAnswer,
      activeQuestion: null,
    });
  }

  await deps.appendMessage({
    sessionId,
    role: "assistant",
    content: nextQuestion.prompt,
    slot: nextQuestion.slot ?? null,
  });
  await deps.updateSession({
    sessionId,
    status: "questioning",
    questionCount: session.questionCount + 1,
  });

  return ok({
    sessionId,
    phase: "questioning",
    transcript: await deps.listMessages(sessionId),
    activeQuestion: nextQuestion,
  });
};
