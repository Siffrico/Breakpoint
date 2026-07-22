import type { Metadata } from "next";

import { WorkspaceShell } from "~/features/training/components/workspace-shell";
import { previewEducationUnit } from "~/features/training/lib/education-unit-preview";
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
  getQueryClient().setQueryData(
    trpc.training.unit.queryKey({
      sessionId: previewSessionId,
      nodeId: previewEducationUnit.nodeId,
    }),
    previewEducationUnit,
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
