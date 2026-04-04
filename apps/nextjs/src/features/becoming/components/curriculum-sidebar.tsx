"use client";

import Link from "next/link";
import { Books, Brain, CaretRight, SidebarSimple } from "@phosphor-icons/react";
import { useState } from "react";

import type { RouterOutputs } from "@acme/api";

type HomeState = RouterOutputs["becoming"]["home"];
type PlanState = RouterOutputs["becoming"]["activePlan"];

export function CurriculumSidebar({
  home,
  plan,
  sessionId,
  preview = false,
  collapsed = false,
  onToggleCollapsed,
}: {
  home: HomeState;
  plan: PlanState;
  sessionId: string;
  preview?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const profileHref = preview ? "/ui/profile" : `/profile?session=${sessionId}`;
  const progress =
    home.totalUnits > 0
      ? Math.round((home.completedUnits / home.totalUnits) * 100)
      : 0;

  const clusters = plan.nodes
    .filter((n) => n.parentNodeId === null)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const childrenByParent = new Map<string, typeof plan.nodes>();
  for (const node of plan.nodes) {
    if (node.parentNodeId) {
      if (!childrenByParent.has(node.parentNodeId)) {
        childrenByParent.set(node.parentNodeId, []);
      }
      childrenByParent.get(node.parentNodeId)!.push(node);
    }
  }

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(clusters.map((cluster) => [cluster.id, true])),
  );

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <aside className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="h-14 border-b border-foreground/[0.06] px-3">
        <div className={`flex h-full items-center ${collapsed ? "justify-center" : "gap-2.5"}`}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="flex h-8 w-8 items-center justify-center text-foreground/48 transition-colors hover:text-foreground"
            aria-label={collapsed ? "Open curriculum sidebar" : "Collapse curriculum sidebar"}
          >
            <SidebarSimple size={15} />
          </button>
          {!collapsed && (
            <div className="text-[13px] text-foreground/70">
              <span>Learning workspace</span>
            </div>
          )}
        </div>
      </div>

      <div className={`space-y-1 px-2 pt-4 ${collapsed ? "pb-2" : "pb-3"}`}>
        <button
          type="button"
          className={`flex w-full items-center ${collapsed ? "justify-center px-0" : "gap-2 px-2"} py-[8px] text-[12px] text-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground`}
        >
          <Brain size={16} weight="regular" className="shrink-0 text-foreground/40" />
          {!collapsed && <span>Learn something</span>}
        </button>

        <button
          type="button"
          className={`flex w-full items-center ${collapsed ? "justify-center px-0" : "gap-2 px-2"} py-[8px] text-[12px] text-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground`}
        >
          <Books size={16} weight="regular" className="shrink-0 text-foreground/40" />
          {!collapsed && <span>Courses</span>}
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto ${collapsed ? "px-2 pt-3 pb-2" : "px-2 pt-3 pb-3"}`}>
        {clusters.map((cluster) => {
          const children = (childrenByParent.get(cluster.id) ?? []).sort(
            (a, b) => a.orderIndex - b.orderIndex,
          );
          const isOpen = expanded[cluster.id] ?? true;

          return (
            <div key={cluster.id} className="mt-4 first:mt-0">
              <button
                type="button"
                onClick={() => toggle(cluster.id)}
                className={`flex w-full items-center ${collapsed ? "justify-center" : "gap-1 px-2"} py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/28 transition-colors hover:text-foreground/48`}
              >
                {!collapsed ? (
                  <>
                    <CaretRight
                      size={12}
                      weight="bold"
                      className={`text-foreground/25 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
                    />
                    <span className="truncate">{cluster.title.toLowerCase()}</span>
                  </>
                ) : (
                  <span className="h-[6px] w-[6px] bg-foreground/28" />
                )}
              </button>

              {isOpen && !collapsed && (
                <div className="mt-0.5">
                  {children.map((node) => {
                    const score = home.nodeScores?.[node.id];
                    const isActive = node.status === "ready";
                    const isCompleted = node.status === "completed";

                    return (
                      <div
                        key={node.id}
                        className={[
                          "group flex items-center gap-2 py-[7px] pr-2 pl-6 text-[12px] leading-none transition-colors",
                          isActive
                            ? "bg-foreground/[0.06] text-foreground"
                            : isCompleted
                              ? "text-foreground/40 hover:bg-foreground/[0.03]"
                              : "text-foreground/25 hover:bg-foreground/[0.03]",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "mt-px h-[6px] w-[6px] shrink-0",
                            isActive
                              ? "bg-foreground/60"
                              : isCompleted
                                ? "border border-foreground/20"
                                : "border border-foreground/10",
                          ].join(" ")}
                        />
                        <span className="flex-1 truncate">{node.title}</span>
                        {score != null && isCompleted && (
                          <span className="shrink-0 font-mono text-[9px] tabular-nums text-foreground/20">
                            {score}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!collapsed && (
        <div className="px-4 pb-3">
          <div className="text-[12px] leading-snug text-foreground/68">
            {home.targetIdentity}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-[2px] flex-1 bg-foreground/[0.06]">
              <div
                className="h-[2px] bg-foreground/28 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="font-mono text-[9px] tabular-nums text-foreground/20">
              {progress}%
            </span>
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="border-t border-foreground/[0.06] px-4 py-4">
          <Link
            href={profileHref}
            className="text-[11px] text-foreground/30 transition-colors hover:text-foreground/60"
          >
            Identity profile →
          </Link>
        </div>
      )}
    </aside>
  );
}
