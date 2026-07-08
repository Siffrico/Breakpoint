import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ProfilePanel } from "~/features/settings/components/profile/profile-panel";
import {
  getProfileAccount,
  getProfileGeneral,
  resolveSettingsSessionId,
} from "~/features/settings/server/settings-queries";

export const metadata: Metadata = {
  title: "Profile · Settings",
  description: "Your account and training identity.",
};

export default async function SettingsProfilePage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await props.searchParams;
  const sessionId = await resolveSettingsSessionId(session);

  if (!sessionId) {
    redirect("/onboarding");
  }

  const [general, account] = await Promise.all([
    getProfileGeneral(sessionId),
    getProfileAccount(),
  ]);

  return (
    <ProfilePanel
      sessionId={sessionId}
      initialGeneral={general}
      account={account}
    />
  );
}
