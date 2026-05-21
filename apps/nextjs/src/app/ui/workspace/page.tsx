import {
  previewHomeState as previewWorkspaceState,
  previewLearningProjects,
  previewPlanState,
  previewSessionId,
} from "~/features/training/lib/training-preview";
import { WorkspaceShell } from "~/features/training/components/workspace-shell";
import { previewEducationUnit } from "~/features/training/lib/education-unit-preview";

export default function UiPreviewWorkspacePage() {
  return (
    <WorkspaceShell
      workspace={previewWorkspaceState}
      plan={previewPlanState}
      unit={previewEducationUnit}
      capstone={null}
      onboardingState={null}
      projects={previewLearningProjects}
      sessionId={previewSessionId}
      preview
    />
  );
}
