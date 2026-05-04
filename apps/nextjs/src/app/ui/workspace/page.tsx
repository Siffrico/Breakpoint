import {
  previewHomeState as previewWorkspaceState,
  previewLearningProjects,
  previewPlanState,
  previewSessionId,
} from "~/features/becoming/lib/becoming-preview";
import { WorkspaceShell } from "~/features/becoming/components/workspace-shell";
import { previewEducationUnit } from "~/features/becoming/lib/education-unit-preview";

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
