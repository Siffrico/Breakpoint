import {
  previewPlanState,
  previewSessionId,
} from "~/features/becoming/lib/becoming-preview";
import { TransformationReveal } from "~/features/becoming/components/transformation-reveal";

export default function UiPreviewTransformationPage() {
  return (
    <TransformationReveal
      plan={previewPlanState}
      sessionId={previewSessionId}
      preview
    />
  );
}
