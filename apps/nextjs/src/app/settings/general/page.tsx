import type { Metadata } from "next";

import { GeneralPanel } from "~/features/settings/components/general/general-panel";
import { listMemories } from "~/features/settings/server/settings-queries";

export const metadata: Metadata = {
  title: "General · Settings",
  description: "Interface preferences and memory.",
};

export default async function SettingsGeneralPage() {
  const memories = await listMemories();

  return <GeneralPanel initialMemories={memories} />;
}
