import type { RouterOutputs } from "@acme/api";
import type { OnboardingChatUIMessage } from "@acme/api/onboarding-chat";

export type OnboardingState = RouterOutputs["training"]["startOnboarding"];

export const transcriptToMessages = (
  state: OnboardingState | null,
): OnboardingChatUIMessage[] => {
  if (!state) return [];
  const messages: OnboardingChatUIMessage[] = state.transcript.map(
    (message) => ({
      id: `seed-${state.sessionId}-${message.sequence}`,
      role: message.role,
      parts: [{ type: "text" as const, text: message.content }],
    }),
  );

  if (state.pendingStartingPointQuestion) {
    const { sequence, input } = state.pendingStartingPointQuestion;
    const messageIndex = messages.findIndex(
      (message) => message.id === `seed-${state.sessionId}-${sequence}`,
    );
    const pendingMessage = {
      id: `seed-${state.sessionId}-${sequence}`,
      role: "assistant" as const,
      parts: [
        {
          type: "tool-askStartingPoint" as const,
          toolCallId: `rehydrated-starting-point-${state.sessionId}`,
          state: "input-available" as const,
          input,
        },
      ],
    } as OnboardingChatUIMessage;

    if (messageIndex === -1) messages.push(pendingMessage);
    else messages[messageIndex] = pendingMessage;
  }

  if (state.pendingProjectProposal) {
    messages.push({
      id: `seed-${state.sessionId}-project-proposal`,
      role: "assistant",
      parts: [
        {
          type: "tool-createProject",
          toolCallId: `rehydrated-create-project-${state.sessionId}`,
          state: "approval-requested",
          input: state.pendingProjectProposal,
          approval: {
            id: `rehydrated-create-project-approval-${state.sessionId}`,
          },
        },
      ],
    } as OnboardingChatUIMessage);
  }

  if (state.projectBuild) {
    messages.push({
      id: `seed-${state.sessionId}-project-build`,
      role: "assistant",
      parts: [{ type: "data-project-build", data: state.projectBuild }],
    });
  }

  return messages;
};
