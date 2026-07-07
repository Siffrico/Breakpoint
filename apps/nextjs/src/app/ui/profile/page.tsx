import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Settings preview",
  description: "Preview the Breakpoint settings screen.",
};

export default function UiPreviewSettingsIndexPage() {
  redirect("/ui/profile/profile");
}
