import type { Metadata } from "next";

import { ProfilePanel } from "~/features/settings/components/profile/profile-panel";
import { SettingsShell } from "~/features/settings/components/settings-shell";
import {
  previewProfileAccount,
  previewProfileGeneral,
} from "~/features/settings/lib/preview-data";

export const metadata: Metadata = {
  title: "Settings · Profile preview",
  description: "Preview the profile settings surface.",
};

export default function UiPreviewSettingsProfilePage() {
  return (
    <SettingsShell basePath="/ui/profile" activeTab="profile">
      <ProfilePanel
        initialGeneral={previewProfileGeneral}
        account={previewProfileAccount}
      />
    </SettingsShell>
  );
}
