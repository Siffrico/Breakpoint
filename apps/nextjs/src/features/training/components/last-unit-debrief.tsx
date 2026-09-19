import type { RouterOutputs } from "@acme/api";

type HomeState = RouterOutputs["training"]["home"];

export function LastUnitDebrief({
  lastCompletedUnit,
}: {
  lastCompletedUnit: NonNullable<HomeState["lastCompletedUnit"]>;
}) {
  const primaryWeakness = lastCompletedUnit.failureTags[0];

  return (
    <div className="border-border/50 border-b pb-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-muted-foreground text-[10px] font-medium tracking-[0.2em] uppercase">
            Last unit
          </div>
          <div className="text-foreground/80 mt-1 truncate text-sm">
            {lastCompletedUnit.title}
          </div>
        </div>
        {lastCompletedUnit.checksMet != null &&
          lastCompletedUnit.checksTotal != null && (
          <div className="text-foreground/60 shrink-0 font-mono text-lg">
            {lastCompletedUnit.checksMet} of {lastCompletedUnit.checksTotal}{" "}
            checks
          </div>
          )}
      </div>
      {primaryWeakness && (
        <div className="text-muted-foreground mt-2 text-xs">
          Weakness: {primaryWeakness.replaceAll("_", " ")}
        </div>
      )}
    </div>
  );
}
