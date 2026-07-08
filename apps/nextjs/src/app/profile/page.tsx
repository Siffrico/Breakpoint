import { redirect } from "next/navigation";

// Settings moved from /profile to /settings. Preserve any session query so deep
// links and bookmarks continue to resolve.
export default async function LegacyProfileRedirect(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await props.searchParams;
  redirect(session ? `/settings?session=${session}` : "/settings");
}
