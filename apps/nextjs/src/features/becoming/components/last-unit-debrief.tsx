import type { RouterOutputs } from "@acme/api";

type HomeState = RouterOutputs["becoming"]["home"];

export function LastUnitDebrief({
  lastCompletedUnit,
}: {
  lastCompletedUnit: NonNullable<HomeState["lastCompletedUnit"]>;
}) {
  const primaryWeakness = lastCompletedUnit.failureTags[0];

  return (
    <div className="border-b border-border/50 pb-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
            Last unit
          </div>
          <div className="mt-1 truncate text-sm text-foreground/80">
            {lastCompletedUnit.title}
          </div>
        </div>
        {lastCompletedUnit.score != null && (
          <div className="shrink-0 font-mono text-lg text-foreground/60">
            {lastCompletedUnit.score}
          </div>
        )}
      </div>
      {primaryWeakness && (
        <div className="mt-2 text-xs text-muted-foreground">
          Weakness: {primaryWeakness.replaceAll("_", " ")}
        </div>
      )}
    </div>
  );
}
