"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Surface, SurfaceContent, SurfaceDescription, SurfaceHeader, SurfaceTitle } from "@acme/ui/surface";
import { Textarea } from "@acme/ui/textarea";
import { toast } from "@acme/ui/toast";

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
  const [targetIdentity, setTargetIdentity] = useState(initialGeneral.targetIdentity);
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
    <div className="grid gap-6">
      <Surface padding="lg">
        <SurfaceHeader>
          <SurfaceTitle>Becoming</SurfaceTitle>
          <SurfaceDescription>
            Edit the target identity the learning path should train toward.
          </SurfaceDescription>
        </SurfaceHeader>
        <SurfaceContent className="mt-6 gap-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Target identity</span>
            <Input
              value={targetIdentity}
              onChange={(event) => setTargetIdentity(event.target.value)}
              placeholder="Staff backend engineer"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Motivation</span>
            <Textarea
              value={motivation}
              onChange={(event) => setMotivation(event.target.value)}
              placeholder="Why this identity matters right now."
            />
          </label>

          <div className="grid gap-3">
            <span className="text-sm font-medium text-foreground">Hard moments</span>
            <div className="flex flex-wrap gap-2">
              {hardMoments.length > 0 ? (
                hardMoments.map((moment) => (
                  <button
                    key={moment}
                    type="button"
                    onClick={() => removeHardMoment(moment)}
                    className="group inline-flex items-center gap-2 border border-border/80 bg-secondary/30 px-3 py-1.5 text-sm text-foreground transition-colors hover:border-foreground/40"
                  >
                    <span>{moment}</span>
                    <span className="text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                      ×
                    </span>
                  </button>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  No hard moments yet. Add the situations that break your current default.
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
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
              <Button variant="outline" onClick={addHardMoment}>
                Add
              </Button>
            </div>
          </div>

          {error ? (
            <div className="text-sm text-destructive">{error}</div>
          ) : null}

          <div className="flex justify-end">
            <Button
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
          </div>
        </SurfaceContent>
      </Surface>

      <Surface padding="lg" variant="muted">
        <SurfaceHeader>
          <SurfaceTitle>Account</SurfaceTitle>
        </SurfaceHeader>
        <SurfaceContent className="mt-5 gap-4 text-sm">
          <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-4">
            <span className="text-muted-foreground">Name</span>
            <span className="text-right text-foreground">{account.name}</span>
          </div>
          <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-4">
            <span className="text-muted-foreground">Email</span>
            <span className="text-right text-foreground">{account.email}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-muted-foreground">Sign-in</span>
            <span className="text-right text-foreground">{formatProvider(account.provider)}</span>
          </div>
        </SurfaceContent>
      </Surface>

      <Surface padding="lg" variant="muted">
        <SurfaceHeader>
          <SurfaceTitle>Billing</SurfaceTitle>
        </SurfaceHeader>
        <SurfaceContent className="mt-5 flex-row items-center justify-between gap-4 text-sm">
          <div className="text-foreground">
            Plan <span className="text-muted-foreground">·</span> {billing.plan}
          </div>
          {billing.manageUrl ? (
            <Button asChild variant="outline" size="sm">
              <Link href={billing.manageUrl} target="_blank" rel="noreferrer">
                Manage
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Manage
            </Button>
          )}
        </SurfaceContent>
      </Surface>
    </div>
  );
}
