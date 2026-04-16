import { ThemePreferenceCard } from "~/features/profile/components/preferences/theme-card";
import { ProfileShell } from "~/features/profile/components/profile-shell";

export default function UiPreviewProfilePreferencesPage() {
  return (
    <ProfileShell basePath="/ui/profile" activeTab="preferences">
      <ThemePreferenceCard />
    </ProfileShell>
  );
}
