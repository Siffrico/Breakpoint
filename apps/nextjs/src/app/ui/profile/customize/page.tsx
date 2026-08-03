import type { Metadata } from "next";

import { SettingsShell } from "~/features/settings/components/settings-shell";
import { CustomizePanel } from "~/features/settings/components/teachers/teachers-panel";
import { previewEducationExperience } from "~/features/settings/lib/preview-data";

export const metadata: Metadata = {
  title: "Settings · Customize preview",
  description: "Preview the agent customization surface.",
};

export default function UiPreviewSettingsCustomizePage() {
  return (
    <SettingsShell basePath="/ui/profile" activeTab="customize">
      <CustomizePanel initial={previewEducationExperience} />
    </SettingsShell>
  );
}
