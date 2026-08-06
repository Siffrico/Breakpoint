"use client";

import Link from "next/link";
import { Code, NotePencil } from "@phosphor-icons/react";

import { Button } from "@acme/ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@acme/ui/menu";

import { UnfinishedOnboardingDialog } from "./unfinished-onboarding-dialog";

export function OnboardingUtilityActions({
  activeSessionId,
  manualSetupHref,
  curriculumMode,
  showCurriculumControl,
  onCurriculumModeChange,
  curriculumChangeDisabled,
}: {
  activeSessionId: string | null;
  manualSetupHref: string;
  curriculumMode: "ability" | "topic";
  showCurriculumControl: boolean;
  onCurriculumModeChange: (mode: "ability" | "topic") => void;
  curriculumChangeDisabled: boolean;
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
      {showCurriculumControl ? (
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                aria-label="Choose curriculum mode"
                title="Choose curriculum mode"
                className="border-foreground/12 bg-background/88 text-foreground/72 hover:border-foreground/22 hover:bg-foreground/[0.04] hover:text-foreground flex size-7 items-center justify-center rounded-none border shadow-sm backdrop-blur outline-none before:rounded-none focus-visible:ring-2"
              />
            }
          >
            <Code size={14} aria-hidden="true" />
          </MenuTrigger>
          <MenuPopup side="bottom" align="end" className="w-40 shadow-lg">
            <MenuGroup>
              <MenuGroupLabel>Curriculum mode</MenuGroupLabel>
              <MenuRadioGroup
                value={curriculumMode}
                onValueChange={(value) => {
                  const nextMode: unknown = value;
                  if (nextMode === "ability" || nextMode === "topic") {
                    onCurriculumModeChange(nextMode);
                  }
                }}
              >
                <MenuRadioItem
                  value="ability"
                  disabled={curriculumChangeDisabled}
                >
                  Abilities
                </MenuRadioItem>
                <MenuRadioItem
                  value="topic"
                  disabled={curriculumChangeDisabled}
                >
                  Topic
                </MenuRadioItem>
              </MenuRadioGroup>
            </MenuGroup>
          </MenuPopup>
        </Menu>
      ) : null}
    </div>
  );
}
