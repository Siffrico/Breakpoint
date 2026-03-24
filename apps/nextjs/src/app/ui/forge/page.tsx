import { previewSessionId } from "~/features/becoming/lib/becoming-preview";
import { previewForgeUnit } from "~/features/becoming/lib/forge-preview";
import { ForgeWorkspace } from "~/features/becoming/components/forge/forge-workspace";

export default function UiPreviewForgePage() {
  return (
    <ForgeWorkspace
      unit={previewForgeUnit}
      sessionId={previewSessionId}
      preview
    />
  );
}
