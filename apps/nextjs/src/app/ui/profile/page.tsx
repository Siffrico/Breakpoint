import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile preview",
  description: "Preview the Breakpoint profile screen.",
};

import { redirect } from "next/navigation";

export default function UiPreviewProfileIndexPage() {
  redirect("/ui/profile/general");
}
