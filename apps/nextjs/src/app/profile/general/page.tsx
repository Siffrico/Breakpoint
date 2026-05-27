import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "General profile settings",
  description: "Manage your Breakpoint account details.",
};

import { redirect } from "next/navigation";

import { GeneralTab } from "~/features/profile/components/general/general-tab";
import {
  getProfileAccount,
  getProfileBilling,
  getProfileGeneral,
  resolveProfileSessionId,
} from "~/features/profile/server/profile-queries";

export default async function ProfileGeneralPage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await props.searchParams;
  const sessionId = await resolveProfileSessionId(session);

  if (!sessionId) {
    redirect("/onboarding");
  }

  const [general, account, billing] = await Promise.all([
    getProfileGeneral(sessionId),
    getProfileAccount(),
    getProfileBilling(),
  ]);

  return (
    <GeneralTab
      sessionId={sessionId}
      initialGeneral={general}
      account={account}
      billing={billing}
    />
  );
}
