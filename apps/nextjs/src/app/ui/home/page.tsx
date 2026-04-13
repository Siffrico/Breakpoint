import {
  previewHomeState,
  previewLearningProjects,
  previewPlanState,
  previewSessionId,
} from "~/features/becoming/lib/becoming-preview";
import { previewForgeUnit } from "~/features/becoming/lib/forge-preview";
import { HomeShell } from "~/features/becoming/components/home-shell";

export default function UiPreviewHomePage() {
  return (
    <HomeShell
      home={previewHomeState}
      plan={previewPlanState}
      unit={previewForgeUnit}
      capstone={null}
      onboardingState={null}
      recallGate={null}
      projects={previewLearningProjects}
      sessionId={previewSessionId}
      preview
    />
  );
}
