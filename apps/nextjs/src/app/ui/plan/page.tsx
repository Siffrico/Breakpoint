import {
  previewPlanState,
  previewSessionId,
} from "~/features/becoming/lib/becoming-preview";
import { CurriculumReveal } from "~/features/becoming/components/curriculum-reveal";

export default function UiPreviewPlanPage() {
  return (
    <CurriculumReveal
      plan={previewPlanState}
      sessionId={previewSessionId}
      preview
    />
  );
}
