import type { Metadata } from "next";

import { MissionPreview } from "~/features/training/components/mission/mission-preview";

export const metadata: Metadata = {
  title: "Mission preview",
  description: "Preview a filled-in Breakpoint mission.",
};

export default function UiPreviewMissionPage() {
  return <MissionPreview />;
}
