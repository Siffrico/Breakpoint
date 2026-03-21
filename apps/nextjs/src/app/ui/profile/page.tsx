import {
  previewProfileState,
  previewSessionId,
} from "~/features/becoming/lib/becoming-preview";
import { ProfileOverview } from "~/features/becoming/components/profile-overview";

export default function UiPreviewProfilePage() {
  return (
    <ProfileOverview
      profile={previewProfileState}
      sessionId={previewSessionId}
      preview
    />
  );
}
