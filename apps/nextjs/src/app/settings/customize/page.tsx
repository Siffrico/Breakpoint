import type { Metadata } from "next";

import { CustomizePanel } from "~/features/settings/components/teachers/teachers-panel";
import { getEducationExperience } from "~/features/settings/server/settings-queries";

export const metadata: Metadata = {
  title: "Customize · Settings",
  description: "Customize the agents that teach your path.",
};

export default async function SettingsCustomizePage() {
  const initial = await getEducationExperience();
  return <CustomizePanel initial={initial} />;
}
