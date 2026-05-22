import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Transformation preview",
  description: "Preview the Breakpoint transformation screen.",
};

import {
  previewPlanState,
  previewSessionId,
} from "~/features/training/lib/training-preview";
import { TransformationReveal } from "~/features/training/components/transformation-reveal";

export default function UiPreviewTransformationPage() {
  return (
    <TransformationReveal
      plan={previewPlanState}
      sessionId={previewSessionId}
      preview
    />
  );
}
