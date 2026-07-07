import type { Metadata } from "next";

import { GeneralPanel } from "~/features/settings/components/general/general-panel";
import { SettingsShell } from "~/features/settings/components/settings-shell";
import { previewMemories } from "~/features/settings/lib/preview-data";

export const metadata: Metadata = {
  title: "Settings · General preview",
  description: "Preview interface preferences and memory.",
};

export default function UiPreviewSettingsGeneralPage() {
  return (
    <SettingsShell basePath="/ui/profile" activeTab="general">
      <GeneralPanel initialMemories={previewMemories} />
    </SettingsShell>
  );
}
