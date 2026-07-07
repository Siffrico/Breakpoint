import type { RouterOutputs } from "@acme/api";

import { MemoryPanel } from "~/features/settings/components/customization/memory-panel";
import { ThemePreferenceCard } from "~/features/settings/components/preferences/theme-card";
import { SettingsPageHeader } from "~/features/settings/components/settings-shell";

type Memory = RouterOutputs["memory"]["list"][number];

export function GeneralPanel({
  initialMemories,
}: {
  initialMemories: Memory[];
}) {
  return (
    <div>
      <SettingsPageHeader title="General" />
      <ThemePreferenceCard />
      <MemoryPanel initialMemories={initialMemories} />
    </div>
  );
}
