import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile preferences",
  description: "Set your Breakpoint learning preferences.",
};

import { ThemePreferenceCard } from "~/features/profile/components/preferences/theme-card";

export default function ProfilePreferencesPage() {
  return <ThemePreferenceCard />;
}
