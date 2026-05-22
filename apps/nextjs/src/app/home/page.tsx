import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
  description: "Review your Breakpoint learning home.",
};

import { redirect } from "next/navigation";

export default async function LegacyHomePage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await props.searchParams;
  redirect(session ? `/workspace?session=${session}` : "/workspace");
}
