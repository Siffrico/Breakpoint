"use client";

import Link from "next/link";

import type { RouterOutputs } from "@acme/api";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";

import {
  SettingRow,
  SettingsPageHeader,
  SettingsSection,
} from "~/features/settings/components/settings-shell";

type BillingState = RouterOutputs["profile"]["getBilling"];

const formatPlan = (plan: string) =>
  plan.charAt(0).toUpperCase() + plan.slice(1);

export function BillingPanel({ billing }: { billing: BillingState }) {
  return (
    <div>
      <SettingsPageHeader
        title="Billing"
        description="Manage your plan and payment details."
      />

      <SettingsSection title="Plan">
        <SettingRow
          label="Current plan"
          description="Your active Breakpoint subscription."
          control={<Badge variant="muted">{formatPlan(billing.plan)}</Badge>}
        />
        <SettingRow
          label="Manage subscription"
          description="Update payment method, invoices, or cancel."
          control={
            billing.manageUrl ? (
              <Button
                render={
                  <Link
                    href={billing.manageUrl}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
                variant="outline"
                size="sm"
              >
                Manage
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Manage
              </Button>
            )
          }
        />
      </SettingsSection>
    </div>
  );
}
