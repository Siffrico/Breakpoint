// NOTE: This /ui/train route is NOT the active learning surface — the real
// preview lives at /ui/workspace (powered by `previewEducationUnit` in
// `education-unit-preview.ts`). When the user asks to edit "the preview"
// or "the unit", they almost certainly mean that one, not this. Confirm
// before editing this file or `previewUnitState`.
import {
  previewSessionId,
  previewUnitState,
} from "~/features/becoming/lib/becoming-preview";
import { UnitWorkspace } from "~/features/becoming/components/unit-workspace";

export default function UiPreviewTrainPage() {
  return (
    <UnitWorkspace unit={previewUnitState} sessionId={previewSessionId} />
  );
}
