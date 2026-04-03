import Link from "next/link";

import type { RouterOutputs } from "@acme/api";

type HomeState = RouterOutputs["becoming"]["home"];
type PlanState = RouterOutputs["becoming"]["activePlan"];

export function CurriculumSidebar({
  home,
  plan,
  sessionId,
  preview = false,
}: {
  home: HomeState;
  plan: PlanState;
  sessionId: string;
  preview?: boolean;
}) {
  const profileHref = preview ? "/ui/profile" : `/profile?session=${sessionId}`;
  const progress =
    home.totalUnits > 0
      ? Math.round((home.completedUnits / home.totalUnits) * 100)
      : 0;

  // Group nodes: clusters (parentNodeId === null) with their children
  const clusters = plan.nodes
    .filter((n) => n.parentNodeId === null)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const childrenByParent = new Map<string, typeof plan.nodes>();
  for (const node of plan.nodes) {
    if (node.parentNodeId) {
      if (!childrenByParent.has(node.parentNodeId))
        childrenByParent.set(node.parentNodeId, []);
      childrenByParent.get(node.parentNodeId)!.push(node);
    }
  }

  return (
    <aside className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-5">
        <div className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
          Becoming
        </div>
        <div className="mt-2 font-display text-base leading-tight tracking-[-0.03em]">
          {home.targetIdentity}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-border">
            <div
              className="h-px bg-foreground/40 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">
            {progress}%
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {clusters.map((cluster) => {
          const children = (childrenByParent.get(cluster.id) ?? []).sort(
            (a, b) => a.orderIndex - b.orderIndex,
          );

          return (
            <div key={cluster.id} className="mb-5">
              <div className="px-1 text-[10px] font-medium tracking-[0.15em] uppercase text-muted-foreground">
                {cluster.title}
              </div>
              <div className="mt-2 space-y-0.5">
                {children.map((node) => {
                  const score = home.nodeScores?.[node.id];
                  const isActive = node.status === "ready";
                  const isCompleted = node.status === "completed";

                  return (
                    <div
                      key={node.id}
                      className={`flex items-start gap-2 rounded-sm px-2 py-1.5 text-sm leading-snug ${
                        isActive
                          ? "bg-accent/50 text-foreground"
                          : isCompleted
                            ? "text-muted-foreground"
                            : "text-muted-foreground/60"
                      }`}
                    >
                      <span className="mt-0.5 shrink-0 text-[10px]">
                        {isCompleted ? "✓" : "·"}
                      </span>
                      <span className="flex-1">
                        {node.title}
                        {node.kind === "simulation" ? " (SIM)" : ""}
                      </span>
                      {score != null && isCompleted && (
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {score}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border px-5 py-4">
        <Link
          href={profileHref}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Identity profile →
        </Link>
      </div>
    </aside>
  );
}
