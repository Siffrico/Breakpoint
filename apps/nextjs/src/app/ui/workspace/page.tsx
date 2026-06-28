import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workspace preview",
  description: "Preview the Breakpoint workspace.",
};

import {
  previewHomeState as previewWorkspaceState,
  previewLearningProjects,
  previewPlanState,
  previewSessionId,
} from "~/features/training/lib/training-preview";
import { WorkspaceShell } from "~/features/training/components/workspace-shell";
import { previewEducationUnit } from "~/features/training/lib/education-unit-preview";
import { TRPCReactProvider } from "~/trpc/react";

export default function UiPreviewWorkspacePage() {
  return (
    <TRPCReactProvider>
      <WorkspaceShell
        workspace={previewWorkspaceState}
        plan={previewPlanState}
        unit={previewEducationUnit}
        onboardingState={null}
        projects={previewLearningProjects}
        sessionId={previewSessionId}
        preview
      />
    </TRPCReactProvider>
  );
}
