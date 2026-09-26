"use client";

import type { MouseEvent } from "react";
import { memo } from "react";

import type { LearningProject } from "./use-workspace-session";
// Imported statically, not via next/dynamic: the lazy/Suspense boundary shifts
// React's useId tree prefix between SSR and hydration, so every Base UI id
// inside the sidebar (menu triggers, settings menu) mismatched on hydration.
import { CurriculumSidebar } from "./curriculum-sidebar";

export type WorkspaceTheme = "light" | "dark" | "warm";

interface WorkspaceSidebarProps {
  projects: LearningProject[];
  selectedSessionId: string;
  preview: boolean;
  collapsed: boolean;
  mobileOpen: boolean;
  userName?: string;
  isSessionRunning: boolean;
  workspaceTheme: WorkspaceTheme;
  onWorkspaceThemeChange: (theme: WorkspaceTheme) => void;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
  onSelectProject: (
    event: MouseEvent<HTMLAnchorElement>,
    sessionId: string,
  ) => void;
  onPrefetchProject: (sessionId: string) => void;
}

function WorkspaceSidebarComponent({
  projects,
  selectedSessionId,
  preview,
  collapsed,
  mobileOpen,
  userName,
  isSessionRunning,
  workspaceTheme,
  onWorkspaceThemeChange,
  onToggleCollapsed,
  onCloseMobile,
  onSelectProject,
  onPrefetchProject,
}: WorkspaceSidebarProps) {
  const commonProps = {
    projects,
    currentSessionId: selectedSessionId,
    preview,
    collapsed: false,
    userName,
    isSessionRunning,
    workspaceTheme,
    onWorkspaceThemeChange,
    onSelectProject,
    onPrefetchProject,
  };

  return (
    <>
      <div
        inert={collapsed ? true : undefined}
        className={[
          "hidden shrink-0 overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] md:block",
          collapsed ? "w-0" : "bg-sidebar w-64",
        ].join(" ")}
      >
        <div className="h-full w-64">
          <CurriculumSidebar
            {...commonProps}
            onToggleCollapsed={onToggleCollapsed}
          />
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close sidebar"
            className="bg-foreground/20 absolute inset-0 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
          <div
            className="bg-sidebar relative h-full w-[min(86vw,320px)] shadow-2xl"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) onCloseMobile();
            }}
          >
            <CurriculumSidebar
              {...commonProps}
              onToggleCollapsed={onCloseMobile}
              onNavigate={onCloseMobile}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

export const WorkspaceSidebar = memo(WorkspaceSidebarComponent);
