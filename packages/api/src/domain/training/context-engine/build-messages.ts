// context-engine/build-messages.ts
//
// Builds the native ModelMessage[] transcript for a phase-agent call: one
// leading context message carrying everything the flattened prompt used to
// carry EXCEPT the transcript (learner profile, curriculum, unit, state,
// evidence, output contract), followed by the real conversation as actual
// user/assistant messages. This lets the provider treat the context block as
// a stable prefix across turns instead of re-deriving it from prose every
// time, and lets phase agents reason over real turn boundaries instead of a
// "ROLE: content" string.

import type { ModelMessage } from "ai";

import type { WorkspaceTurnRuntime } from "../workspace-ai/stage-runtime";
import type { WorkspaceAiMessage } from "../workspace-ai/types";
import { WORKSPACE_CONTEXT_BUDGET } from "./context-budget";
import { renderWorkspaceStageContextPrompt } from "./render-context-prompt";
import type { WorkspaceContextEnvelope } from "./schemas";

const toModelMessage = (message: WorkspaceAiMessage): ModelMessage => ({
  role: message.role,
  content: message.content,
});

export const buildWorkspaceModelMessages = ({
  envelope,
  runtime,
  messages,
}: {
  envelope: WorkspaceContextEnvelope;
  runtime: WorkspaceTurnRuntime;
  /** The raw session transcript — same input selectWorkspaceEvidence() receives. */
  messages: WorkspaceAiMessage[];
}): ModelMessage[] => {
  const contextBlock = renderWorkspaceStageContextPrompt({
    envelope,
    runtime,
    includeTranscript: false,
  });

  // Same budget selectWorkspaceEvidence() uses for its prose transcript, so
  // the two code paths never disagree about how much history is "recent."
  const transcript = messages
    .slice(-WORKSPACE_CONTEXT_BUDGET.recentTranscriptMessages)
    .map(toModelMessage);

  return [{ role: "user", content: contextBlock }, ...transcript];
};
