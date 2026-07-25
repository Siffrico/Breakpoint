import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Plan preview",
  description: "Preview the Breakpoint plan screen.",
};

export default function UiPreviewPlanPage() {
  redirect("/ui/curriculum");
}
