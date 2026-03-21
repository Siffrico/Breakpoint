import {
  previewHomeState,
  previewSessionId,
} from "~/features/becoming/lib/becoming-preview";
import { HomeOverview } from "~/features/becoming/components/home-overview";

export default function UiPreviewHomePage() {
  return (
    <HomeOverview
      home={previewHomeState}
      sessionId={previewSessionId}
      preview
    />
  );
}
