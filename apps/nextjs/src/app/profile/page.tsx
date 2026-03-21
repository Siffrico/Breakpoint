import { redirect } from "next/navigation";

import { ProfileOverview } from "~/features/becoming/components/profile-overview";
import { getProfileState } from "~/features/becoming/server/becoming-queries";

export default async function ProfilePage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const searchParams = await props.searchParams;
  const sessionId = searchParams.session;

  if (!sessionId) {
    redirect("/onboarding");
  }

  const profile = await getProfileState(sessionId);

  return <ProfileOverview profile={profile} sessionId={sessionId} />;
}
