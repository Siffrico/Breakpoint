import type { Metadata } from "next";

import { BillingPanel } from "~/features/settings/components/billing/billing-panel";
import { SettingsShell } from "~/features/settings/components/settings-shell";
import { previewProfileBilling } from "~/features/settings/lib/preview-data";

export const metadata: Metadata = {
  title: "Settings · Billing preview",
  description: "Preview the billing surface.",
};

export default function UiPreviewSettingsBillingPage() {
  return (
    <SettingsShell basePath="/ui/profile" activeTab="billing">
      <BillingPanel billing={previewProfileBilling} />
    </SettingsShell>
  );
}
