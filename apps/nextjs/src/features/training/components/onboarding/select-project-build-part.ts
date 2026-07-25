import type {
  OnboardingChatUIMessage,
  ProjectBuildState,
} from "@acme/api/onboarding-chat";

export interface SelectedProjectBuildPart {
  messageId: string;
  partIndex: number;
  state: ProjectBuildState;
}

export const selectProjectBuildPart = (
  messages: OnboardingChatUIMessage[],
): SelectedProjectBuildPart | null => {
  let latest: SelectedProjectBuildPart | null = null;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;

    for (let j = message.parts.length - 1; j >= 0; j -= 1) {
      const part = message.parts[j];
      if (part?.type !== "data-project-build") continue;

      const candidate: SelectedProjectBuildPart = {
        messageId: message.id,
        partIndex: j,
        state: part.data as ProjectBuildState,
      };
      latest ??= candidate;

      if (candidate.state.phase === "complete") return candidate;
    }
  }

  return latest;
};
