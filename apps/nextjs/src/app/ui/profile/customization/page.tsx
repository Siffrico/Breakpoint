import { MemoryPanel } from "~/features/profile/components/customization/memory-panel";
import { ProfileShell } from "~/features/profile/components/profile-shell";
import { previewMemories } from "~/features/profile/lib/preview-data";

export default function UiPreviewProfileCustomizationPage() {
  return (
    <ProfileShell basePath="/ui/profile" activeTab="customization">
      <MemoryPanel initialMemories={previewMemories} />
    </ProfileShell>
  );
}
