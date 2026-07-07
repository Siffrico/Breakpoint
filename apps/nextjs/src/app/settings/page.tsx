import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your Breakpoint settings.",
};

export default async function SettingsPage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await props.searchParams;
  redirect(
    session ? `/settings/profile?session=${session}` : "/settings/profile",
  );
}
