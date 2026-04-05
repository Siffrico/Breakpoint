"use client";

import Link from "next/link";
import { Books, Brain, CaretRight, SidebarSimple } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { RouterOutputs } from "@acme/api";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";

type HomeState = RouterOutputs["becoming"]["home"];
type PlanState = RouterOutputs["becoming"]["activePlan"];
type LearningProject = RouterOutputs["becoming"]["listLearningProjects"][number];

export function CurriculumSidebar({
  home,
  plan,
  projects = [],
  currentSessionId,
  preview = false,
  collapsed = false,
  onToggleCollapsed,
}: {
  home: HomeState | null;
  plan: PlanState | null;
  projects?: LearningProject[];
  currentSessionId: string;
  preview?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const profileHref = preview ? "/ui/profile" : `/profile?session=${currentSessionId}`;
  const progress =
    home && home.totalUnits > 0
      ? Math.round((home.completedUnits / home.totalUnits) * 100)
      : 0;

  const clusters = useMemo(
    () =>
      (plan?.nodes ?? [])
        .filter((node) => node.parentNodeId === null)
        .sort((left, right) => left.orderIndex - right.orderIndex),
    [plan],
  );

  const childrenByParent = useMemo(() => {
    const nextMap = new Map<string, NonNullable<PlanState>["nodes"]>();
    for (const node of plan?.nodes ?? []) {
      if (!node.parentNodeId) continue;
      if (!nextMap.has(node.parentNodeId)) {
        nextMap.set(node.parentNodeId, []);
      }
      nextMap.get(node.parentNodeId)!.push(node);
    }
    return nextMap;
  }, [plan]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(clusters.map((cluster) => [cluster.id, true])),
  );

  const startOnboarding = useMutation(
    trpc.becoming.startOnboarding.mutationOptions({
      onSuccess: (data) => {
        router.push(`/home?session=${data.sessionId}`);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
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
          {!collapsed ? (
            <div className="text-[13px] text-foreground/70">
              <span>Learning workspace</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className={`space-y-1 px-2 pt-4 ${collapsed ? "pb-2" : "pb-3"}`}>
        <button
          type="button"
          onClick={() => !preview && startOnboarding.mutate()}
          disabled={startOnboarding.isPending}
          className={`flex w-full items-center ${collapsed ? "justify-center px-0" : "gap-2 px-2"} py-[8px] text-[12px] text-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-40`}
        >
          <Brain size={16} weight="regular" className="shrink-0 text-foreground/40" />
          {!collapsed ? <span>Learn something new</span> : null}
        </button>

        <button
          type="button"
          className={`flex w-full items-center ${collapsed ? "justify-center px-0" : "gap-2 px-2"} py-[8px] text-[12px] text-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground`}
        >
          <Books size={16} weight="regular" className="shrink-0 text-foreground/40" />
          {!collapsed ? <span>Projects</span> : null}
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto ${collapsed ? "px-2 pt-3 pb-2" : "px-2 pt-3 pb-3"}`}>
        {!collapsed ? (
          <div className="space-y-1">
            {projects.map((project) => {
              const isActive = project.sessionId === currentSessionId;

              return (
                <Link
                  key={project.sessionId}
                  href={preview ? "/ui/home" : `/home?session=${project.sessionId}`}
                  className={[
                    "block border px-3 py-3 transition-colors",
                    isActive
                      ? "border-foreground/14 bg-foreground/[0.05]"
                      : "border-transparent hover:border-foreground/[0.08] hover:bg-foreground/[0.03]",
                  ].join(" ")}
                >
                  <div className="text-[12px] leading-5 text-foreground/82">
                    {project.title}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-foreground/28">
                    {project.status}
                  </div>
                  {project.lessonPreview.length > 0 ? (
                    <div className="mt-3 space-y-1">
                      {project.lessonPreview.map((lesson) => (
                        <div
                          key={lesson.id}
                          className="truncate text-[11px] text-foreground/48"
                        >
                          {lesson.title}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-[11px] text-foreground/35">
                      {project.headline}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        ) : null}

        {plan && clusters.length > 0 ? (
          <div className={collapsed ? "mt-3" : "mt-6"}>
            {clusters.map((cluster) => {
              const children = (childrenByParent.get(cluster.id) ?? []).sort(
                (left, right) => left.orderIndex - right.orderIndex,
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

                  {isOpen && !collapsed ? (
                    <div className="mt-0.5">
                      {children.map((node) => {
                        const score = home?.nodeScores?.[node.id];
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
                            {score != null && isCompleted ? (
                              <span className="shrink-0 font-mono text-[9px] tabular-nums text-foreground/20">
                                {score}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {!collapsed && home ? (
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
      ) : null}

      {!collapsed && home ? (
        <div className="border-t border-foreground/[0.06] px-4 py-4">
          <Link
            href={profileHref}
            className="text-[11px] text-foreground/30 transition-colors hover:text-foreground/60"
          >
            Identity profile →
          </Link>
        </div>
      ) : null}
    </aside>
  );
}
