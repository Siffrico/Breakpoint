import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Home preview",
  description: "Preview the Breakpoint home screen.",
};

export default function LegacyUiHomePage() {
  redirect("/ui/workspace");
}
