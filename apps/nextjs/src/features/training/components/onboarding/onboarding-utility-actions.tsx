"use client";

import Link from "next/link";
import { NotePencil } from "@phosphor-icons/react";

import { Button } from "@acme/ui/button";

import { UnfinishedOnboardingDialog } from "./unfinished-onboarding-dialog";

export function OnboardingUtilityActions({
  activeSessionId,
  manualSetupHref,
}: {
  activeSessionId: string | null;
  manualSetupHref: string;
}) {
  return (
    <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5">
      <UnfinishedOnboardingDialog activeSessionId={activeSessionId} />
      <Button
        render={<Link href={manualSetupHref} />}
        variant="outline"
        size="icon-sm"
        aria-label="Set up manually"
        title="Set up manually"
        className="border-foreground/12 bg-background/88 text-foreground/72 hover:border-foreground/22 hover:bg-foreground/[0.04] hover:text-foreground size-7 rounded-none shadow-sm backdrop-blur before:rounded-none"
      >
        <NotePencil size={14} aria-hidden="true" />
      </Button>
    </div>
  );
}
