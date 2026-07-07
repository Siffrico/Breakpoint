import type { Metadata } from "next";

import { TeachersPanel } from "~/features/settings/components/teachers/teachers-panel";

export const metadata: Metadata = {
  title: "Teachers · Settings",
  description: "The agents that teach your path.",
};

export default function SettingsTeachersPage() {
  return <TeachersPanel />;
}
