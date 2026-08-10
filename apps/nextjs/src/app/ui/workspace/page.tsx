import type { Metadata } from "next";

import { WorkspaceShell } from "~/features/training/components/workspace-shell";
import { previewAiWorkspace } from "~/features/training/lib/education-unit-preview";
import {
  previewLearningProjects,
  previewPlanState,
  previewSessionId,
} from "~/features/training/lib/training-preview";
import { TRPCReactProvider } from "~/trpc/react";
import { getQueryClient, HydrateClient, trpc } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Workspace preview",
  description: "Preview the Breakpoint workspace.",
};

export default function UiPreviewWorkspacePage() {
  const queryClient = getQueryClient();
  // The workspace query is disabled under `preview`, so this seeded transcript
  // is what the trail renders — the preview's stand-in for a live chat.
  queryClient.setQueryData(
    trpc.training.aiWorkspace.queryKey({ sessionId: previewSessionId }),
    previewAiWorkspace,
  );

  return (
    <TRPCReactProvider>
      <HydrateClient>
        <WorkspaceShell
          plan={previewPlanState}
          onboardingState={null}
          projects={previewLearningProjects}
          sessionId={previewSessionId}
          preview
        />
      </HydrateClient>
    </TRPCReactProvider>
  );
}
