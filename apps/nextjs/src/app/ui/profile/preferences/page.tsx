import { ThemePreferenceCard } from "~/features/profile/components/preferences/theme-card";
import { ProfileShell } from "~/features/profile/components/profile-shell";
import { previewProfileAccount } from "~/features/profile/lib/preview-data";

export default function UiPreviewProfilePreferencesPage() {
  return (
    <ProfileShell
      name={previewProfileAccount.name}
      image={previewProfileAccount.image}
      basePath="/ui/profile"
      activeTab="preferences"
    >
      <ThemePreferenceCard />
    </ProfileShell>
  );
}
