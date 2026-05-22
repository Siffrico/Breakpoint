import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile preferences preview",
  description: "Preview profile preference settings.",
};

import { ThemePreferenceCard } from "~/features/profile/components/preferences/theme-card";
import { ProfileShell } from "~/features/profile/components/profile-shell";

export default function UiPreviewProfilePreferencesPage() {
  return (
    <ProfileShell basePath="/ui/profile" activeTab="preferences">
      <ThemePreferenceCard />
    </ProfileShell>
  );
}
