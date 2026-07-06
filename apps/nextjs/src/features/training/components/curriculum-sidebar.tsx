"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  CaretRight,
  DotsThree,
  Gear,
  MagnifyingGlass,
  MapTrifold,
  NotePencil,
  Plus,
  SidebarSimple,
  Storefront,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { DotmCircular17 } from "@acme/ui/dotm-circular-17";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@acme/ui/menu";
import { toast } from "@acme/ui/toast";

import { useLocalStorage } from "~/hooks/use-local-storage";
import { useTRPC } from "~/trpc/react";
import { useCommandPalette } from "../hooks/use-command-palette";
import { WorkspaceCommandPalette } from "./workspace-command-palette";

type LearningProject =
  RouterOutputs["training"]["listLearningProjects"][number];

const EMPTY_PROJECTS: LearningProject[] = [];

type WorkspaceTheme = "light" | "dark" | "warm";

const WORKSPACE_THEME_OPTIONS: {
  label: string;
  value: WorkspaceTheme;
}[] = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "Warm", value: "warm" },
];

const WORKSPACE_MAIN_COLORS: Record<
  WorkspaceTheme,
  Pick<CSSProperties, "backgroundColor" | "borderColor" | "color">
> = {
  dark: {
    backgroundColor: "#161616",
    borderColor: "color-mix(in oklab, #eeeeee 10%, transparent)",
    color: "#eeeeee",
  },
  light: {
    backgroundColor: "#fafafa",
    borderColor: "color-mix(in oklab, #1f1d18 12%, transparent)",
    color: "#1f1d18",
  },
  warm: {
    backgroundColor: "#161616",
    borderColor: "color-mix(in oklab, #eeeeee 10%, transparent)",
    color: "#eeeeee",
  },
};

const SIDEBAR_FADE_STYLE = {
  WebkitMaskImage:
    "linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) calc(100% - 18px), rgba(0,0,0,0) 100%)",
  maskImage:
    "linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) calc(100% - 18px), rgba(0,0,0,0) 100%)",
} satisfies CSSProperties;

function FadeLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["overflow-hidden whitespace-nowrap", className]
        .filter(Boolean)
        .join(" ")}
      style={SIDEBAR_FADE_STYLE}
    >
      {children}
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/[0.04] flex size-6 shrink-0 items-center justify-center rounded-[5px] transition-colors outline-none focus:outline-none focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

function SettingsQuickMenu({
  profileHref,
  workspaceTheme,
  onWorkspaceThemeChange,
}: {
  profileHref: string;
  workspaceTheme: WorkspaceTheme;
  onWorkspaceThemeChange: (theme: WorkspaceTheme) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        openOnHover
        delay={80}
        closeDelay={450}
        render={
          <button
            type="button"
            aria-label="Settings"
            className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/[0.04] flex size-7 shrink-0 items-center justify-center rounded-[6px] transition-colors outline-none focus:outline-none focus-visible:outline-none"
          />
        }
      >
        <Gear size={14} />
      </MenuTrigger>
      <MenuPopup
        side="top"
        align="center"
        sideOffset={8}
        style={WORKSPACE_MAIN_COLORS[workspaceTheme]}
        className="w-40 shadow-lg"
      >
        <MenuGroup>
          <MenuGroupLabel className="text-current opacity-60">
            Workspace theme
          </MenuGroupLabel>
          <MenuRadioGroup
            value={workspaceTheme}
            onValueChange={(value) =>
              onWorkspaceThemeChange(value as WorkspaceTheme)
            }
          >
            {WORKSPACE_THEME_OPTIONS.map((option) => (
              <MenuRadioItem
                key={option.value}
                value={option.value}
                className="text-current data-checked:bg-[color-mix(in_oklab,currentColor_12%,transparent)] data-highlighted:bg-[color-mix(in_oklab,currentColor_8%,transparent)] data-highlighted:text-current data-highlighted:data-checked:bg-[color-mix(in_oklab,currentColor_16%,transparent)]"
              >
                {option.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator className="bg-[color-mix(in_oklab,currentColor_12%,transparent)]" />
        <MenuGroup>
          <MenuItem
            render={<Link href={profileHref} />}
            className="text-current data-highlighted:bg-[color-mix(in_oklab,currentColor_8%,transparent)] data-highlighted:text-current"
          >
            <Gear size={14} aria-hidden="true" />
            All settings
          </MenuItem>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

function StatusDot({ state }: { state: "planned" | "ready" | "completed" }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "block h-[8px] w-[8px] shrink-0 rounded-full transition-colors",
        state === "ready"
          ? "bg-foreground/68"
          : state === "completed"
            ? "bg-foreground/24"
            : "border-foreground/22 border bg-transparent",
      ].join(" ")}
    />
  );
}

function ChatRow({
  title,
  status,
  href,
  isRunning = false,
  isActive = false,
}: {
  title: string;
  status?: string;
  href: string;
  isRunning?: boolean;
  isActive?: boolean;
}) {
  const isReady = status === "ready";
  const isCompleted = status === "completed";
  const dotState: "planned" | "ready" | "completed" = isReady
    ? "ready"
    : isCompleted
      ? "completed"
      : "planned";

  return (
    <Link
      href={href}
      aria-current={isActive ? "true" : undefined}
      className={[
        "group hover:bg-foreground/[0.035] flex w-full items-center gap-2.5 rounded-[6px] px-2 py-[6px] text-left text-[13px] transition-colors outline-none focus:outline-none focus-visible:outline-none",
        isActive
          ? "bg-foreground/[0.045] text-foreground/92"
          : isReady
            ? "text-foreground/86"
            : isCompleted
              ? "text-foreground/40"
              : "text-foreground/56",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-[14px] w-[14px] shrink-0 items-center justify-center",
          isRunning ? "text-foreground/72" : "",
        ].join(" ")}
      >
        {isRunning ? (
          <DotmCircular17 size={13} dotSize={1.5} />
        ) : (
          <StatusDot state={dotState} />
        )}
      </span>
      <FadeLabel className="min-w-0 flex-1 leading-[18px]">{title}</FadeLabel>
    </Link>
  );
}

function ProjectRow({
  project,
  href,
  overviewHref,
  curriculumHref,
  isCurrent,
  isExpanded,
  activeLessonId,
  isSessionRunning,
  onToggle,
  onContinue,
  isContinuing,
  preview = false,
}: {
  project: LearningProject;
  href: string;
  overviewHref: string;
  curriculumHref: string;
  isCurrent: boolean;
  isExpanded: boolean;
  activeLessonId?: string | null;
  isSessionRunning?: boolean;
  onToggle: () => void;
  onContinue: () => void;
  isContinuing: boolean;
  preview?: boolean;
}) {
  // Server sends newest-first, capped at 10. Default to a 3-row window; the
  // learner can widen it per project when more chats actually exist.
  const [showAllChats, setShowAllChats] = useState(false);
  const lessons = showAllChats
    ? project.lessonPreview
    : project.lessonPreview.slice(0, 3);
  const hasMoreChats = project.lessonPreview.length > 3;

  return (
    <div>
      <div
        className={[
          "group/project hover:bg-foreground/[0.035] flex w-full items-center rounded-[6px] transition-colors",
          isCurrent ? "text-foreground/92" : "text-foreground/72",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={(event) => {
            event.currentTarget.blur();
            onToggle();
          }}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${project.title}`}
          className="text-foreground/36 hover:text-foreground/72 flex size-6 shrink-0 items-center justify-center pl-1 transition-colors outline-none focus:outline-none focus-visible:outline-none"
        >
          <CaretRight
            size={10}
            weight="regular"
            className={[
              "shrink-0 transition-transform duration-150",
              isExpanded ? "rotate-90" : "",
            ].join(" ")}
          />
        </button>

        <Link
          href={href}
          className="hover:text-foreground/92 flex min-w-0 flex-1 py-[6px] pr-1 text-left text-[13px] font-normal transition-colors outline-none focus:outline-none focus-visible:outline-none"
        >
          <FadeLabel className="min-w-0 flex-1 leading-[18px]">
            {project.title}
          </FadeLabel>
        </Link>

        <button
          type="button"
          onClick={onContinue}
          disabled={isContinuing || project.status !== "active"}
          aria-label={`Continue ${project.title}`}
          title={
            project.status === "active"
              ? `Continue ${project.title}`
              : "Curriculum is still being prepared"
          }
          className="text-foreground/32 hover:text-foreground/80 hover:bg-foreground/[0.05] pointer-events-none flex size-6 shrink-0 items-center justify-center rounded-[5px] opacity-0 transition-[color,background-color,opacity] outline-none group-hover/project:pointer-events-auto group-hover/project:opacity-100 focus:outline-none focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-0 group-hover/project:disabled:opacity-25"
        >
          {isContinuing ? (
            <DotmCircular17 size={13} dotSize={1.5} />
          ) : (
            <NotePencil size={15} weight="regular" />
          )}
        </button>

        <ProjectActionsMenu
          overviewHref={overviewHref}
          curriculumHref={curriculumHref}
        />
      </div>

      {isExpanded && lessons.length > 0 ? (
        <div className="border-foreground/[0.06] mt-px ml-[10px] border-l pl-[6px]">
          {lessons.map((lesson) => (
            <ChatRow
              key={lesson.id}
              title={lesson.title}
              status={lesson.status}
              // The workspace resolves the live chat back to the plain URL, so
              // deep-linking every row is safe: past chats open read-only
              // history, the live one opens the normal workspace.
              href={
                preview ? href : `${href}&chat=${encodeURIComponent(lesson.id)}`
              }
              isActive={isCurrent && lesson.id === activeLessonId}
              isRunning={
                Boolean(isSessionRunning && isCurrent) &&
                lesson.id === activeLessonId
              }
            />
          ))}
          {hasMoreChats ? (
            <button
              type="button"
              onClick={() => setShowAllChats((prev) => !prev)}
              className="text-foreground/36 hover:text-foreground/64 flex w-full items-center rounded-[6px] px-2 py-[5px] text-left text-[12px] transition-colors outline-none focus:outline-none focus-visible:outline-none"
            >
              <FadeLabel className="min-w-0 flex-1 leading-[16px]">
                {showAllChats ? "Show less" : "Show more"}
              </FadeLabel>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProjectActionsMenu({
  overviewHref,
  curriculumHref,
}: {
  overviewHref: string;
  curriculumHref: string;
}) {
  return (
    <Menu>
      <MenuTrigger
        openOnHover
        delay={80}
        closeDelay={320}
        render={
          <button
            type="button"
            aria-label="Project actions"
            className="text-foreground/28 hover:text-foreground/76 hover:bg-foreground/[0.05] flex size-6 shrink-0 items-center justify-center rounded-[5px] opacity-80 transition-colors outline-none group-hover/project:opacity-100 focus:outline-none focus-visible:outline-none"
          />
        }
      >
        <DotsThree size={16} weight="bold" />
      </MenuTrigger>
      <MenuPopup
        side="right"
        align="start"
        sideOffset={6}
        className="border-foreground/[0.1] bg-background text-foreground w-36 rounded-none shadow-[0_10px_30px_rgba(0,0,0,0.12)] before:rounded-none"
      >
        <MenuItem
          render={<Link href={curriculumHref} />}
          className="rounded-none text-[13px]"
        >
          <BookOpenText size={14} aria-hidden="true" />
          Curriculum
        </MenuItem>
        <MenuItem
          render={<Link href={overviewHref} />}
          className="rounded-none text-[13px]"
        >
          <MapTrifold size={14} aria-hidden="true" />
          Overview
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

export function CurriculumSidebar({
  projects = EMPTY_PROJECTS,
  currentSessionId,
  preview = false,
  collapsed = false,
  onToggleCollapsed,
  userName,
  userPlan = "Free Plan",
  activeLessonId,
  isSessionRunning = false,
  workspaceTheme = "warm",
  onWorkspaceThemeChange,
  onNavigate,
}: {
  projects?: LearningProject[];
  currentSessionId: string;
  preview?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  userName?: string;
  userPlan?: string;
  activeLessonId?: string | null;
  isSessionRunning?: boolean;
  workspaceTheme?: WorkspaceTheme;
  onWorkspaceThemeChange?: (theme: WorkspaceTheme) => void;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const profileHref = preview
    ? "/ui/profile"
    : `/profile?session=${currentSessionId}`;

  const handleNewProject = () => {
    if (preview) return;
    // Make new-project intent explicit. A plain /onboarding visit restores the
    // latest session, including a completed build card after an accidental reload.
    router.push("/onboarding?new=1");
  };

  const continueProject = useMutation(
    trpc.training.continueLearningProject.mutationOptions({
      onSuccess: (destination) => {
        onNavigate?.();
        if (destination.sessionId === currentSessionId) {
          router.refresh();
          return;
        }
        router.push(destination.href);
      },
      onError: (error) => {
        toast.error(
          error.message || "The next scenario could not be prepared.",
        );
      },
    }),
  );

  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette({
    onNewTopic: handleNewProject,
  });

  const [expanded, setExpanded] = useLocalStorage<Record<string, boolean>>(
    "bp-sidebar-expanded",
    {},
  );

  // Drop expansion state for projects that no longer exist so the stored map
  // doesn't accumulate stale session ids forever.
  useEffect(() => {
    if (preview || projects.length === 0) return;
    const liveIds = new Set(projects.map((project) => project.sessionId));
    setExpanded((prev) => {
      const staleKeys = Object.keys(prev).filter((key) => !liveIds.has(key));
      if (staleKeys.length === 0) return prev;
      const next = { ...prev };
      for (const key of staleKeys) delete next[key];
      return next;
    });
  }, [preview, projects, setExpanded]);

  const toggleProject = (sessionId: string, currentDefault: boolean) => {
    setExpanded((prev) => {
      const isOpen = prev[sessionId] ?? currentDefault;
      return { ...prev, [sessionId]: !isOpen };
    });
  };

  const displayName = userName ?? "You";
  const initial = displayName.trim().charAt(0).toUpperCase() || "·";

  const commandPalette = (
    <WorkspaceCommandPalette
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      onNewTopic={handleNewProject}
      preview={preview}
    />
  );

  if (collapsed) {
    return (
      <aside className="bg-sidebar text-sidebar-foreground flex h-full flex-col">
        <div className="flex h-12 items-center justify-center">
          <IconButton label="Open sidebar" onClick={onToggleCollapsed}>
            <SidebarSimple size={14} />
          </IconButton>
        </div>

        <div className="flex flex-col items-center gap-0.5 px-2 pt-1">
          <IconButton label="New project" onClick={handleNewProject}>
            <Plus size={14} />
          </IconButton>
          <IconButton label="Search" onClick={() => setPaletteOpen(true)}>
            <MagnifyingGlass size={14} />
          </IconButton>
          <Link href="/courses" aria-label="Courses">
            <IconButton label="Courses">
              <Storefront size={14} />
            </IconButton>
          </Link>
        </div>

        {commandPalette}

        <div className="flex-1" />

        <div className="flex flex-col items-center gap-1.5 py-2.5">
          <SettingsQuickMenu
            profileHref={profileHref}
            workspaceTheme={workspaceTheme}
            onWorkspaceThemeChange={onWorkspaceThemeChange ?? (() => undefined)}
          />
          <div className="bg-primary/70 text-primary-foreground flex size-5 items-center justify-center rounded-full text-[10px] font-medium">
            {initial}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="bg-sidebar text-sidebar-foreground flex h-full flex-col">
      {/* Top icon row */}
      <div className="flex h-12 items-center justify-between px-2.5">
        <div className="flex items-center gap-0.5">
          <IconButton label="Collapse sidebar" onClick={onToggleCollapsed}>
            <SidebarSimple size={14} />
          </IconButton>
          <IconButton label="Search" onClick={() => setPaletteOpen(true)}>
            <MagnifyingGlass size={14} />
          </IconButton>
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-2">
        <button
          type="button"
          onClick={handleNewProject}
          className="hover:bg-foreground/[0.04] flex w-full items-center gap-2.5 rounded-[6px] px-2 py-[7px] text-left transition-colors outline-none focus:outline-none focus-visible:outline-none disabled:opacity-50"
        >
          <Plus size={15} className="text-foreground/56 shrink-0" />
          <FadeLabel className="text-foreground/86 min-w-0 flex-1 text-[13px] font-normal">
            New topic
          </FadeLabel>
          <span className="text-foreground/30 shrink-0 font-mono text-[11px] tracking-tight">
            ⌘N
          </span>
        </button>

        <Link
          href="/courses"
          className="hover:bg-foreground/[0.04] flex w-full items-center gap-2.5 rounded-[6px] px-2 py-[7px] text-left transition-colors outline-none focus:outline-none focus-visible:outline-none"
        >
          <Storefront size={15} className="text-foreground/40 shrink-0" />
          <FadeLabel className="text-foreground/68 min-w-0 flex-1 text-[13px] font-normal">
            Courses
          </FadeLabel>
        </Link>
      </div>

      {/* Scrollable projects list (each project = a header with its chats under it) */}
      <div className="flex-1 overflow-y-auto px-2 pt-4 pb-2">
        {projects.length > 0 ? (
          <div className="text-foreground/36 px-2 pb-1.5 text-[12px] font-normal">
            Projects
          </div>
        ) : null}

        {projects.length === 0 ? (
          <div className="text-foreground/34 px-2 pt-3 text-[12px] leading-[18px]">
            No projects yet. Start a new one above.
          </div>
        ) : null}

        <div className="space-y-2">
          {projects.map((project) => {
            const isCurrent = project.sessionId === currentSessionId;
            const isExpanded = expanded[project.sessionId] ?? isCurrent;
            const href = preview
              ? "/ui/workspace"
              : `/workspace?session=${project.sessionId}`;
            const curriculumHref = preview
              ? "/ui/curriculum"
              : `/curriculum?session=${project.sessionId}`;
            const overviewHref = preview
              ? "/ui/overview"
              : `/overview?session=${project.sessionId}`;
            return (
              <ProjectRow
                key={project.sessionId}
                project={project}
                href={href}
                overviewHref={overviewHref}
                curriculumHref={curriculumHref}
                isCurrent={isCurrent}
                isExpanded={isExpanded}
                activeLessonId={activeLessonId}
                isSessionRunning={isSessionRunning}
                onToggle={() => toggleProject(project.sessionId, isCurrent)}
                onContinue={() => {
                  if (preview) {
                    router.push(href);
                    return;
                  }
                  continueProject.mutate({ sessionId: project.sessionId });
                }}
                isContinuing={
                  continueProject.isPending &&
                  continueProject.variables.sessionId === project.sessionId
                }
                preview={preview}
              />
            );
          })}
        </div>

      </div>

      {/* Footer: user */}
      <div className="flex items-center gap-1 p-2">
        <div className="hover:bg-foreground/[0.035] flex max-w-[calc(100%-2rem)] min-w-0 items-center gap-2.5 rounded-[6px] p-1.5 transition-colors">
          <div className="bg-primary/70 text-primary-foreground flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-medium">
            {initial}
          </div>
          <FadeLabel className="text-foreground/84 min-w-0 text-[13px] leading-[18px] font-normal">
            {displayName}
            <span className="text-foreground/30"> · </span>
            <span className="text-foreground/52">{userPlan}</span>
          </FadeLabel>
        </div>
        <div className="flex-1" />
        <SettingsQuickMenu
          profileHref={profileHref}
          workspaceTheme={workspaceTheme}
          onWorkspaceThemeChange={onWorkspaceThemeChange ?? (() => undefined)}
        />
      </div>

      {commandPalette}
    </aside>
  );
}
