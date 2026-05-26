import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plan preview",
  description: "Preview the Breakpoint plan screen.",
};

import { redirect } from "next/navigation";

export default function UiPreviewPlanPage() {
  redirect("/ui/curriculum");
}
