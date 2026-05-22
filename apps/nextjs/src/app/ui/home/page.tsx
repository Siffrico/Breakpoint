import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home preview",
  description: "Preview the Breakpoint home screen.",
};

import { redirect } from "next/navigation";

export default function LegacyUiHomePage() {
  redirect("/ui/workspace");
}
