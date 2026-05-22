import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile",
  description: "Manage your Breakpoint profile.",
};

import { redirect } from "next/navigation";

export default async function ProfilePage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const searchParams = await props.searchParams;
  redirect(
    searchParams.session
      ? `/profile/general?session=${searchParams.session}`
      : "/profile/general",
  );
}
