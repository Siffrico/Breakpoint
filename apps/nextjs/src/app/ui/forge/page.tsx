import { previewSessionId } from "~/features/becoming/lib/becoming-preview";
import { previewForgeUnit } from "~/features/becoming/lib/forge-preview";
import { EducationUnitWorkspace } from "~/features/becoming/components/education-unit/education-unit-workspace";

export default function UiPreviewForgePage() {
  return (
    <EducationUnitWorkspace
      unit={previewForgeUnit}
      sessionId={previewSessionId}
      preview
    />
  );
}
