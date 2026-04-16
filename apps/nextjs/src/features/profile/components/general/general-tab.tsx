"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Textarea } from "@acme/ui/textarea";
import { toast } from "@acme/ui/toast";

import {
  SettingField,
  SettingFooter,
  SettingRow,
  SettingsPageHeader,
  SettingsSection,
} from "~/features/profile/components/profile-shell";
import { useTRPC } from "~/trpc/react";

type GeneralState = RouterOutputs["profile"]["getGeneral"];
type AccountState = RouterOutputs["profile"]["getAccount"];
type BillingState = RouterOutputs["profile"]["getBilling"];

const formatProvider = (provider: string | null) => {
  if (!provider) {
    return "Email";
  }

  return provider.charAt(0).toUpperCase() + provider.slice(1);
};

export function GeneralTab({
  initialGeneral,
  account,
  billing,
}: {
  initialGeneral: GeneralState;
  account: AccountState;
  billing: BillingState;
}) {
  const trpc = useTRPC();
  const [savedGeneral, setSavedGeneral] = useState(initialGeneral);
  const [targetIdentity, setTargetIdentity] = useState(
    initialGeneral.targetIdentity,
  );
  const [motivation, setMotivation] = useState(initialGeneral.motivation);
  const [hardMoments, setHardMoments] = useState(initialGeneral.hardMoments);
  const [hardMomentDraft, setHardMomentDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSavedGeneral(initialGeneral);
    setTargetIdentity(initialGeneral.targetIdentity);
    setMotivation(initialGeneral.motivation);
    setHardMoments(initialGeneral.hardMoments);
  }, [initialGeneral]);

  const updateGeneral = useMutation(
    trpc.profile.updateGeneral.mutationOptions({
      onSuccess: (updated) => {
        setError(null);
        setSavedGeneral(updated);
        setTargetIdentity(updated.targetIdentity);
        setMotivation(updated.motivation);
        setHardMoments(updated.hardMoments);
        toast.success("Profile saved.");
      },
      onError: (mutationError) => {
        setError(mutationError.message);
        toast.error(mutationError.message);
      },
    }),
  );

  const isDirty = useMemo(
    () =>
      targetIdentity !== savedGeneral.targetIdentity ||
      motivation !== savedGeneral.motivation ||
      hardMoments.join("\u0001") !== savedGeneral.hardMoments.join("\u0001"),
    [hardMoments, motivation, savedGeneral, targetIdentity],
  );

  const addHardMoment = () => {
    const nextMoment = hardMomentDraft.trim();
    if (!nextMoment || hardMoments.includes(nextMoment)) {
      setHardMomentDraft("");
      return;
    }

    setHardMoments((current) => [...current, nextMoment]);
    setHardMomentDraft("");
  };

  const removeHardMoment = (moment: string) => {
    setHardMoments((current) => current.filter((item) => item !== moment));
  };

  return (
    <div>
      <SettingsPageHeader title="General" />

      <SettingsSection title="Becoming">
        <SettingRow
          label="Target identity"
          description="What the learning path should train toward."
          control={
            <Input
              value={targetIdentity}
              onChange={(event) => setTargetIdentity(event.target.value)}
              placeholder="Staff backend engineer"
              className="w-[280px]"
            />
          }
        />
        <SettingField
          label="Motivation"
          description="Why this identity matters right now."
        >
          <Textarea
            value={motivation}
            onChange={(event) => setMotivation(event.target.value)}
            placeholder="Why this identity matters right now."
          />
        </SettingField>
        <SettingField
          label="Hard moments"
          description="Situations that break your current default."
        >
          <div className="flex flex-wrap gap-2">
            {hardMoments.length > 0 ? (
              hardMoments.map((moment) => (
                <button
                  key={moment}
                  type="button"
                  onClick={() => removeHardMoment(moment)}
                  className="group border-foreground/12 bg-foreground/[0.04] hover:border-foreground/28 text-foreground/88 inline-flex items-center gap-2 border px-2.5 py-1 text-[12px] transition-colors"
                >
                  <span>{moment}</span>
                  <span className="text-foreground/44 group-hover:text-foreground/88 text-[13px] leading-none transition-colors">
                    ×
                  </span>
                </button>
              ))
            ) : (
              <div className="text-foreground/48 text-[12px]">
                No hard moments yet.
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              value={hardMomentDraft}
              onChange={(event) => setHardMomentDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addHardMoment();
                }
              }}
              placeholder="Add a hard moment"
            />
            <Button variant="outline" size="sm" onClick={addHardMoment}>
              Add
            </Button>
          </div>
        </SettingField>
        {error ? (
          <div className="text-destructive px-5 pb-3 text-[12px]">{error}</div>
        ) : null}
        <SettingFooter>
          <Button
            size="sm"
            loading={updateGeneral.isPending}
            disabled={!isDirty || updateGeneral.isPending}
            onClick={() =>
              updateGeneral.mutate({
                sessionId: initialGeneral.sessionId,
                targetIdentity,
                motivation,
                hardMoments,
              })
            }
          >
            Save
          </Button>
        </SettingFooter>
      </SettingsSection>

      <SettingsSection title="Account">
        <SettingRow
          label="Name"
          control={
            <span className="text-foreground/82 text-[12.5px]">
              {account.name}
            </span>
          }
        />
        <SettingRow
          label="Email"
          control={
            <span className="text-foreground/82 text-[12.5px]">
              {account.email}
            </span>
          }
        />
        <SettingRow
          label="Sign-in"
          control={
            <span className="text-foreground/82 text-[12.5px]">
              {formatProvider(account.provider)}
            </span>
          }
        />
      </SettingsSection>

      <SettingsSection title="Billing">
        <SettingRow
          label="Plan"
          description={billing.plan}
          control={
            billing.manageUrl ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={billing.manageUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Manage
                </Link>
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
