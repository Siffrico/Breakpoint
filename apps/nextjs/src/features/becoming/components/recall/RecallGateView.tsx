"use client";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";

import { CompressionProbe } from "./CompressionProbe";
import { InterleaveProbe } from "./InterleaveProbe";
import { RecallRepairPrompt } from "./RecallRepairPrompt";
import { SeedReturnProbe } from "./SeedReturnProbe";

type RecallGate = RouterOutputs["becoming"]["getRecallGate"];

export function RecallGateView({
  gate,
  onSubmitProbe,
  isPending = false,
  onContinue,
}: {
  gate: RecallGate;
  onSubmitProbe: (
    probeId: string,
    mode: "probe" | "repair",
    response: string,
  ) => Promise<void>;
  isPending?: boolean;
  onContinue?: () => void;
}) {
  const unresolvedProbe =
    gate.probes.find((probe) => probe.status === "pending") ??
    gate.probes.find((probe) => probe.status === "repair_pending") ??
    null;
  const completedProbeCount = gate.probes.filter(
    (probe) => probe.status !== "pending" && probe.status !== "repair_pending",
  ).length;

  return (
    <section className="flex flex-col gap-6">
      <div className="border border-border bg-card p-6 shadow-[0_18px_80px_rgba(2,6,23,0.18)]">
        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
              Recall gate
            </span>
            <h2 className="font-display mt-3 text-4xl tracking-[-0.05em] text-foreground">
              Hold what you already learned
            </h2>
          </div>
          <span className="border border-primary/20 bg-primary/8 px-3 py-1.5 text-[10px] font-medium tracking-[0.2em] uppercase text-primary">
            {completedProbeCount}/{gate.probes.length} resolved
          </span>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-foreground/65">
          This gate checks whether earlier concepts are still live enough to build on.
          Short answers are fine. Shallow answers are not.
        </p>
      </div>

      {unresolvedProbe ? (
        unresolvedProbe.status === "repair_pending" && unresolvedProbe.repairPrompt ? (
          <RecallRepairPrompt
            prompt={unresolvedProbe.repairPrompt}
            onSubmit={(response) =>
              onSubmitProbe(unresolvedProbe.id, "repair", response)
            }
            disabled={isPending}
            isPending={isPending}
          />
        ) : unresolvedProbe.probeType === "seed_return" ? (
          <SeedReturnProbe
            prompt={unresolvedProbe.prompt}
            seedSnapshot={unresolvedProbe.seedSnapshot}
            onSubmit={(response) =>
              onSubmitProbe(unresolvedProbe.id, "probe", response)
            }
            disabled={isPending}
            isPending={isPending}
          />
        ) : unresolvedProbe.probeType === "interleave" ? (
          <InterleaveProbe
            prompt={unresolvedProbe.prompt}
            onSubmit={(response) =>
              onSubmitProbe(unresolvedProbe.id, "probe", response)
            }
            disabled={isPending}
            isPending={isPending}
          />
        ) : (
          <CompressionProbe
            prompt={unresolvedProbe.prompt}
            onSubmit={(response) =>
              onSubmitProbe(unresolvedProbe.id, "probe", response)
            }
            disabled={isPending}
            isPending={isPending}
          />
        )
      ) : (
        <section className="border border-border bg-card p-6">
          <div className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
            Gate resolved
          </div>
          <p className="mt-4 text-sm leading-7 text-foreground/70">
            The recall gate is complete. Continue when you&apos;re ready.
          </p>
          {onContinue ? (
            <div className="mt-5 flex justify-end">
              <Button
                type="button"
                onClick={onContinue}
                className="h-11 bg-primary px-6 text-primary-foreground hover:brightness-110"
              >
                Continue
              </Button>
            </div>
          ) : null}
        </section>
      )}
    </section>
  );
}
