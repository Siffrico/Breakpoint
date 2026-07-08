import type { Metadata } from "next";

import { SettingsShell } from "~/features/settings/components/settings-shell";
import { TeachersPanel } from "~/features/settings/components/teachers/teachers-panel";

export const metadata: Metadata = {
  title: "Settings · Teachers preview",
  description: "Preview the teacher agents surface.",
};

export default function UiPreviewSettingsTeachersPage() {
  return (
    <SettingsShell basePath="/ui/profile" activeTab="teachers">
      <TeachersPanel />
    </SettingsShell>
  );
}
