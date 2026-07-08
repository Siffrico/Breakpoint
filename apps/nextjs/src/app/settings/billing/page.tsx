import type { Metadata } from "next";

import { BillingPanel } from "~/features/settings/components/billing/billing-panel";
import { getProfileBilling } from "~/features/settings/server/settings-queries";

export const metadata: Metadata = {
  title: "Billing · Settings",
  description: "Manage your plan and payment details.",
};

export default async function SettingsBillingPage() {
  const billing = await getProfileBilling();

  return <BillingPanel billing={billing} />;
}
