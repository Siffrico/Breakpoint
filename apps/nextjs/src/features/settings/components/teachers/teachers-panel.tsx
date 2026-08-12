"use client";

import { useMemo, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";
import { toast } from "@acme/ui/toast";

import { SettingsPageHeader } from "~/features/settings/components/settings-shell";
import { ModelSwitcherCard } from "~/features/settings/components/teachers/model-switcher-card";
import { useTRPC } from "~/trpc/react";

type ExperienceState = RouterOutputs["profile"]["getEducationExperience"];
type Customization = ExperienceState["customization"];
const cloneCustomization = (value: Customization): Customization =>
  structuredClone(value);

function AgentHeader({
  name,
  edited,
  open,
  onToggle,
}: {
  name: string;
  edited: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="hover:bg-foreground/[0.02] flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors outline-none"
    >
      <div className="flex items-center gap-2">
        <span className="text-foreground text-[13px] font-medium">{name}</span>
        {edited ? (
          <span className="text-foreground/40 text-[10px] font-medium tracking-[0.04em] uppercase">
            Edited
          </span>
        ) : null}
      </div>
      <CaretDown
        size={14}
        weight="bold"
        className={cn(
          "text-foreground/40 mt-1 shrink-0 transition-transform duration-200",
          open && "rotate-180",
        )}
      />
    </button>
  );
}

export function CustomizePanel({ initial }: { initial: ExperienceState }) {
  const trpc = useTRPC();
  const [saved, setSaved] = useState(() =>
    cloneCustomization(initial.customization),
  );
  const [draft, setDraft] = useState(() =>
    cloneCustomization(initial.customization),
  );
  const [openId, setOpenId] = useState<"mentor" | "reviewer" | null>("mentor");

  const updateExperience = useMutation(
    trpc.profile.updateEducationExperience.mutationOptions({
      onSuccess: (updated) => {
        setSaved(cloneCustomization(updated));
        setDraft(cloneCustomization(updated));
        toast.success("Agent customization saved.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved],
  );
  const mentorEdited =
    draft.main.instructions !== initial.defaults.main.instructions;
  const reviewerEdited =
    JSON.stringify(draft.reviewer) !==
    JSON.stringify(initial.defaults.reviewer);

  return (
    <div>
      <SettingsPageHeader title="Customize" />

      <div className="mt-6">
        <ModelSwitcherCard />
      </div>

      <div className="divide-border/60 border-border/50 bg-secondary mt-6 divide-y overflow-hidden rounded-lg border">
        <div>
          <AgentHeader
            name="Unit mentor"
            edited={mentorEdited}
            open={openId === "mentor"}
            onToggle={() =>
              setOpenId((current) => (current === "mentor" ? null : "mentor"))
            }
          />
          {openId === "mentor" ? (
            <div className="px-4 pb-4">
              <label
                htmlFor="mentor-prompt"
                className="text-foreground/55 mb-1.5 block text-[11px] font-medium"
              >
                Behavior prompt
              </label>
              <Textarea
                id="mentor-prompt"
                value={draft.main.instructions}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    main: { instructions: event.target.value },
                  }))
                }
                rows={6}
                className="text-[12.5px] leading-5"
              />
              <p className="text-foreground/45 mt-2 text-[11px] leading-4">
                Mentor teaching checks are grounded in each unit&apos;s mastery
                contract.
              </p>
            </div>
          ) : null}
        </div>

        <div>
          <AgentHeader
            name="Adversarial reviewer"
            edited={reviewerEdited}
            open={openId === "reviewer"}
            onToggle={() =>
              setOpenId((current) =>
                current === "reviewer" ? null : "reviewer",
              )
            }
          />
          {openId === "reviewer" ? (
            <div className="px-4 pb-4">
              <label
                htmlFor="reviewer-prompt"
                className="text-foreground/55 mb-1.5 block text-[11px] font-medium"
              >
                Behavior prompt
              </label>
              <Textarea
                id="reviewer-prompt"
                value={draft.reviewer.instructions}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    reviewer: {
                      ...current.reviewer,
                      instructions: event.target.value,
                    },
                  }))
                }
                rows={6}
                className="text-[12.5px] leading-5"
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="ghost"
          disabled={updateExperience.isPending}
          onClick={() => setDraft(cloneCustomization(initial.defaults))}
        >
          Reset to defaults
        </Button>
        <Button
          loading={updateExperience.isPending}
          disabled={!isDirty || updateExperience.isPending}
          onClick={() => updateExperience.mutate(draft)}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
