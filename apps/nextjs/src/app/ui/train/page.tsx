import {
  previewSessionId,
  previewUnitState,
} from "~/features/becoming/lib/becoming-preview";
import { UnitWorkspace } from "~/features/becoming/components/unit-workspace";

export default function UiPreviewTrainPage() {
  return (
    <UnitWorkspace
      unit={previewUnitState}
      sessionId={previewSessionId}
      preview
    />
  );
}
