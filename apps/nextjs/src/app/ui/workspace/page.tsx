import {
  previewHomeState as previewWorkspaceState,
  previewLearningProjects,
  previewPlanState,
  previewSessionId,
} from "~/features/becoming/lib/becoming-preview";
import { previewForgeUnit } from "~/features/becoming/lib/forge-preview";
import { WorkspaceShell } from "~/features/becoming/components/workspace-shell";

export default function UiPreviewWorkspacePage() {
  return (
    <WorkspaceShell
      workspace={previewWorkspaceState}
      plan={previewPlanState}
      unit={previewForgeUnit}
      capstone={null}
      onboardingState={null}
      projects={previewLearningProjects}
      sessionId={previewSessionId}
      preview
    />
  );
}
