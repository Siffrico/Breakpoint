"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretRight, Pause } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@acme/ui/button";
import {
  CommandDialog,
  CommandDialogPopup,
  CommandDialogPrimitive,
} from "@acme/ui/command";

import { useTRPC } from "~/trpc/react";

const STATUS_LABEL = {
  onboarding: "Onboarding",
  building: "Building",
  interrupted: "Interrupted",
  error: "Needs retry",
} as const;

const relativeTime = (date: Date) => {
  const elapsed = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(elapsed / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

/**
 * Takes the active session id, produces an owned unfinished-session switcher,
 * and fails visually only when its query cannot be loaded.
 */
export function UnfinishedOnboardingDialog({
  activeSessionId,
}: {
  activeSessionId: string | null;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const query = useQuery(
    trpc.training.listUnfinishedOnboardings.queryOptions(undefined, {
      enabled: open,
    }),
  );
  const sessions = useMemo(
    () =>
      (query.data ?? []).sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
      ),
    [query.data],
  );

  const resume = (sessionId: string) => {
    if (sessionId === activeSessionId) return;
    setOpen(false);
    router.push(`/onboarding?session=${encodeURIComponent(sessionId)}`);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="Open unfinished onboardings"
        title="Unfinished onboardings"
        onClick={() => setOpen(true)}
        className="border-foreground/12 bg-background/88 text-foreground/72 hover:border-foreground/22 hover:bg-foreground/[0.04] hover:text-foreground size-7 rounded-none shadow-sm backdrop-blur before:rounded-none"
      >
        <Pause size={14} weight="fill" aria-hidden="true" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandDialogPopup className="border-border bg-background max-w-xl overflow-hidden shadow-2xl before:bg-white/[0.08]">
          <div className="border-border bg-card border-b px-5 py-4">
            <CommandDialogPrimitive.Title className="text-foreground text-sm font-medium">
              Unfinished onboardings
            </CommandDialogPrimitive.Title>
            <CommandDialogPrimitive.Description className="text-muted-foreground mt-0.5 text-xs">
              Pick up an earlier conversation without losing this one.
            </CommandDialogPrimitive.Description>
          </div>

          <div className="bg-background max-h-[min(26rem,64vh)] overflow-y-auto p-3">
            {query.isLoading ? (
              <div className="space-y-1" aria-label="Loading onboardings">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="bg-foreground/[0.045] h-12 animate-pulse rounded-lg"
                  />
                ))}
              </div>
            ) : query.isError ? (
              <div className="text-muted-foreground flex min-h-24 flex-col items-center justify-center gap-2 text-xs">
                <span>Couldn&apos;t load your onboardings.</span>
                <button
                  type="button"
                  onClick={() => void query.refetch()}
                  className="text-foreground underline underline-offset-4"
                >
                  Try again
                </button>
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-muted-foreground flex min-h-24 items-center justify-center text-xs">
                No unfinished onboardings.
              </div>
            ) : (
              <div className="space-y-1">
                {sessions.map((session) => {
                  const current = session.sessionId === activeSessionId;
                  return (
                    <button
                      key={session.sessionId}
                      type="button"
                      disabled={current}
                      onClick={() => resume(session.sessionId)}
                      className="border-border/45 bg-card/55 hover:border-border hover:bg-accent focus-visible:ring-ring group flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors outline-none focus-visible:ring-2 disabled:cursor-default disabled:opacity-75"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="text-foreground block truncate text-[13px] font-medium">
                          {session.title}
                        </span>
                        <span className="text-muted-foreground mt-0.5 block text-[11px]">
                          {current ? "Current" : STATUS_LABEL[session.status]} ·{" "}
                          {relativeTime(session.updatedAt)}
                        </span>
                      </span>
                      {!current ? (
                        <CaretRight
                          size={14}
                          aria-hidden="true"
                          className="text-muted-foreground/55 group-hover:text-foreground shrink-0 transition-colors"
                        />
                      ) : (
                        <span className="bg-foreground/7 text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
                          Here
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </CommandDialogPopup>
      </CommandDialog>
    </>
  );
}
