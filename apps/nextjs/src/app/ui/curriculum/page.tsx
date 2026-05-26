import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Curriculum preview",
  description: "Preview the Breakpoint curriculum screen.",
};

import { CurriculumReveal } from "~/features/training/components/curriculum-reveal";
import {
  previewPlanState,
  previewSessionId,
} from "~/features/training/lib/training-preview";

export default function UiPreviewCurriculumPage() {
  return (
    <CurriculumReveal
      plan={previewPlanState}
      sessionId={previewSessionId}
      preview
    />
  );
}
