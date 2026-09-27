"use client";

import type { CSSProperties, MouseEvent, ReactNode, RefObject } from "react";
import { memo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Gear,
  MagnifyingGlass,
  NotePencil,
  Plus,
  PushPin,
  SidebarSimple,
  Storefront,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { cn } from "@acme/ui";
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

import type { TopicFaceMood } from "./topic-face";
import { useTRPC } from "~/trpc/react";
import { useCommandPalette } from "../hooks/use-command-palette";
import { TopicFace } from "./topic-face";
import { WorkspaceCommandPalette } from "./workspace-command-palette";

type LearningProject =
  RouterOutputs["training"]["listLearningProjects"][number];

const EMPTY_PROJECTS: LearningProject[] = [];

/** Recent rows shown before "Show more"; pinned topics are never capped. */
const RECENT_PREVIEW_LIMIT = 8;

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

// Shared row tokens, so nav rows, topic rows, and section labels read as one
// system. Layout follows Synara's activity sidebar, ~12% taller.
//
// Alignment grid: every row insets 16px (list px-2 + row px-2), every leading
// glyph sits in a 20px slot, and every label starts 8px after it. Icons, faces,
// section labels, and the avatar share one left edge (16px); every label
// shares the next (44px).
const FACE_SIZE = 20;
const ROW_FOCUS_CLASS =
  "outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-foreground/20";
const ROW_HOVER_CLASS = "hover:bg-foreground/[0.04]";
const ROW_ACTIVE_CLASS = "bg-foreground/[0.06]";
const SECTION_LABEL_CLASS = "text-foreground/45 text-[13px] font-normal";

/**
 * Pinned topics first, in the order they were pinned (so the list does not
 * reshuffle under the learner); everything else stays in the server's
 * most-recently-updated order.
 */
function partitionTopics(projects: LearningProject[]) {
  const pinned = projects
    .filter((project) => project.pinnedAt)
    .sort(
      (left, right) =>
        (left.pinnedAt?.getTime() ?? 0) - (right.pinnedAt?.getTime() ?? 0),
    );
  const recent = projects.filter((project) => !project.pinnedAt);
  return { pinned, recent };
}

/** What the topic's face shows: the same states the status line names. */
function resolveTopicMood(
  project: LearningProject,
  isRunning: boolean,
): TopicFaceMood {
  if (project.status !== "active") return "thinking";
  return isRunning ? "streaming" : "idle";
}

/** The one line that says where the topic stands. */
function describeTopicStatus(project: LearningProject) {
  if (project.status === "onboarding") return "Interview in progress";
  if (project.status === "building") return "Preparing curriculum…";
  return project.lessonPreview[0]?.title ?? "Ready to start";
}

function formatLastActive(date: Date) {
  const minutes = Math.max(
    1,
    Math.floor((Date.now() - date.getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Pins or unpins a topic. The sidebar reads the listLearningProjects cache, so
 * the row moves sections immediately; a failed write rolls the cache back and
 * the settled refetch reconciles with the server either way.
 */
function useSetTopicPinned() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const projectsKey = trpc.training.listLearningProjects.queryKey();

  return useMutation(
    trpc.training.setLearningProjectPinned.mutationOptions({
      onMutate: async ({ sessionId, pinned }) => {
        await queryClient.cancelQueries({ queryKey: projectsKey });
        const previous = queryClient.getQueryData(projectsKey);
        queryClient.setQueryData(projectsKey, (current) =>
          current?.map((project) =>
            project.sessionId === sessionId
              ? {
                  ...project,
                  pinnedAt: pinned ? (project.pinnedAt ?? new Date()) : null,
                }
              : project,
          ),
        );
        return { previous };
      },
      onError: (error, variables, context) => {
        if (context?.previous) {
          queryClient.setQueryData(projectsKey, context.previous);
        }
        toast.error(
          error.message ||
            `The topic could not be ${variables.pinned ? "pinned" : "unpinned"}.`,
        );
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: projectsKey }),
    }),
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

function NavRow({
  icon,
  label,
  shortcut,
  href,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  href?: string;
  onClick?: () => void;
}) {
  const className = cn(
    "text-foreground/89 flex h-[30px] w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[13px] font-normal",
    ROW_FOCUS_CLASS,
    ROW_HOVER_CLASS,
  );
  const content = (
    <>
      <span className="flex size-5 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut ? (
        <span className="text-foreground/30 shrink-0 font-mono text-[11px] tracking-tight">
          {shortcut}
        </span>
      ) : null}
    </>
  );

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

/**
 * Row-level menu opened by right-clicking a topic. There is no visible
 * trigger: the popup anchors to the row itself, so the row stays quiet at rest.
 */
function TopicActionsMenu({
  anchor,
  open,
  onOpenChange,
  isPinned,
  overviewHref,
  onTogglePinned,
}: {
  anchor: RefObject<HTMLDivElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPinned: boolean;
  overviewHref: string;
  onTogglePinned: () => void;
}) {
  return (
    <Menu open={open} onOpenChange={onOpenChange}>
      <MenuPopup anchor={anchor} side="right" align="start" sideOffset={6}>
        <MenuItem onClick={onTogglePinned}>
          <PushPin weight={isPinned ? "fill" : "regular"} />
          {isPinned ? "Unpin" : "Pin"}
        </MenuItem>
        <MenuItem render={<Link href={overviewHref} />}>
          <Gear />
          Topic settings
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

/**
 * Two-line topic row: face, then title over status + last-active time. The
 * face's expression carries the topic's state. The whole row is
 * the "take me to the next step" action; the arrow only appears on hover as
 * its hint. Pin and settings live in the right-click menu. Press feedback is
 * transform-only (scale + nudge), so it stays on the compositor.
 */
function TopicRow({
  project,
  href,
  overviewHref,
  isCurrent,
  isRunning,
  onNavigate,
  onPrefetch,
  onTogglePinned,
}: {
  project: LearningProject;
  href: string;
  overviewHref: string;
  isCurrent: boolean;
  isRunning: boolean;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
  onPrefetch: () => void;
  onTogglePinned: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      ref={rowRef}
      className="group/topic relative"
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      <Link
        href={href}
        onClick={(event) => {
          // A double-click is one intent; the second click must not send a
          // second resume request or push a duplicate history entry.
          if (event.detail > 1) {
            event.preventDefault();
            return;
          }
          onNavigate(event);
        }}
        onMouseEnter={onPrefetch}
        onFocus={onPrefetch}
        aria-current={isCurrent ? "page" : undefined}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-[11.5px] text-left select-none",
          "transition-[background-color,scale] duration-150 ease-out active:scale-[0.985] motion-reduce:active:scale-100",
          ROW_FOCUS_CLASS,
          isCurrent || menuOpen ? ROW_ACTIVE_CLASS : ROW_HOVER_CLASS,
        )}
      >
        <TopicFace
          seed={project.sessionId}
          mood={resolveTopicMood(project, isRunning)}
          size={FACE_SIZE}
          trackRef={rowRef}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[13px] leading-5 font-normal",
                isCurrent ? "text-foreground" : "text-foreground/90",
              )}
            >
              {project.title}
            </span>
            <ArrowRight
              size={11}
              weight="bold"
              aria-hidden="true"
              className="text-foreground/55 mr-0.5 shrink-0 scale-x-[1.18] opacity-0 transition-[opacity,translate] duration-150 ease-out group-hover/topic:opacity-100 group-active/topic:translate-x-[2px] group-has-[:focus-visible]/topic:opacity-100 motion-reduce:group-active/topic:translate-x-0"
            />
          </span>
          <span className="flex min-w-0 items-center gap-2 text-[12px] leading-4">
            <span className="text-foreground/50 min-w-0 truncate">
              {describeTopicStatus(project)}
            </span>
            <span
              // Relative to the viewer's clock, so the server render can be a
              // minute off from the client's.
              suppressHydrationWarning
              className="text-foreground/38 ml-auto shrink-0 tabular-nums"
            >
              {formatLastActive(project.updatedAt)}
            </span>
          </span>
        </span>
      </Link>

      <TopicActionsMenu
        anchor={rowRef}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        isPinned={project.pinnedAt !== null}
        overviewHref={overviewHref}
        onTogglePinned={onTogglePinned}
      />
    </div>
  );
}

function TopicSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-1.5 px-2">
        <span className={SECTION_LABEL_CLASS}>{label}</span>
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

function CurriculumSidebarComponent({
  projects = EMPTY_PROJECTS,
  currentSessionId,
  preview = false,
  collapsed = false,
  onToggleCollapsed,
  userName,
  userPlan = "Free Plan",
  isSessionRunning = false,
  workspaceTheme = "warm",
  onWorkspaceThemeChange,
  onSelectProject,
  onPrefetchProject,
  onResumeProject,
}: {
  projects?: LearningProject[];
  currentSessionId: string;
  preview?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  userName?: string;
  userPlan?: string;
  isSessionRunning?: boolean;
  workspaceTheme?: WorkspaceTheme;
  onWorkspaceThemeChange?: (theme: WorkspaceTheme) => void;
  onSelectProject?: (
    event: MouseEvent<HTMLAnchorElement>,
    sessionId: string,
  ) => void;
  onPrefetchProject?: (sessionId: string) => void;
  onResumeProject?: (sessionId: string) => void;
}) {
  const router = useRouter();
  const [showAllRecent, setShowAllRecent] = useState(false);
  const profileHref = preview
    ? "/ui/profile"
    : `/settings?session=${currentSessionId}`;

  const handleNewProject = () => {
    if (preview) return;
    router.push("/onboarding");
  };

  const setTopicPinned = useSetTopicPinned();

  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette({
    onNewTopic: handleNewProject,
  });

  const displayName = userName ?? "You";
  const initial = displayName.trim().charAt(0).toUpperCase() || "·";

  const commandPalette = (
    <WorkspaceCommandPalette
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      onNewTopic={handleNewProject}
      onContinueProject={(sessionId) => {
        if (!preview) onResumeProject?.(sessionId);
      }}
      workspaceTheme={workspaceTheme}
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

  const { pinned, recent } = partitionTopics(projects);
  const visibleRecent = showAllRecent
    ? recent
    : recent.slice(0, RECENT_PREVIEW_LIMIT);
  const hasHiddenRecent = recent.length > RECENT_PREVIEW_LIMIT;

  const renderTopic = (project: LearningProject) => {
    const isCurrent = project.sessionId === currentSessionId;
    const href = preview
      ? "/ui/workspace"
      : `/workspace?session=${project.sessionId}`;
    return (
      <TopicRow
        key={project.sessionId}
        project={project}
        href={href}
        overviewHref={
          preview
            ? `/ui/profile/topics/${project.sessionId}`
            : `/settings/topics/${project.sessionId}`
        }
        isCurrent={isCurrent}
        isRunning={isSessionRunning && isCurrent}
        onNavigate={(event) => onSelectProject?.(event, project.sessionId)}
        onPrefetch={() => onPrefetchProject?.(project.sessionId)}
        onTogglePinned={() => {
          if (preview) return;
          setTopicPinned.mutate({
            sessionId: project.sessionId,
            pinned: project.pinnedAt === null,
          });
        }}
      />
    );
  };

  return (
    <aside className="bg-sidebar text-sidebar-foreground flex h-full flex-col">
      <div className="flex h-12 items-center justify-between pr-2.5 pl-4">
        <span className="text-foreground/92 truncate text-[15px] font-semibold tracking-tight">
          Breakpoint
        </span>
        <div className="flex items-center gap-0.5">
          <IconButton label="Search" onClick={() => setPaletteOpen(true)}>
            <MagnifyingGlass size={14} />
          </IconButton>
          <IconButton label="Collapse sidebar" onClick={onToggleCollapsed}>
            <SidebarSimple size={14} />
          </IconButton>
        </div>
      </div>

      <nav className="flex flex-col gap-px px-2">
        <NavRow
          icon={<NotePencil size={15} />}
          label="New topic"
          shortcut="⌘N"
          onClick={handleNewProject}
        />
        <NavRow
          icon={<Storefront size={15} />}
          label="Courses"
          href="/courses"
        />
      </nav>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-2 pt-5 pb-2">
        {projects.length === 0 ? (
          <div className="text-foreground/40 px-2 text-[12px] leading-[18px]">
            No topics yet. Start a new one above.
          </div>
        ) : null}

        {pinned.length > 0 ? (
          <TopicSection label="Pinned">{pinned.map(renderTopic)}</TopicSection>
        ) : null}

        {recent.length > 0 ? (
          <TopicSection label="Recent">
            {visibleRecent.map(renderTopic)}
            {hasHiddenRecent ? (
              <button
                type="button"
                onClick={() => setShowAllRecent((shown) => !shown)}
                className={cn(
                  "text-foreground/50 hover:text-foreground/85 h-7 rounded-lg pr-2 pl-9 text-left text-[13px]",
                  ROW_FOCUS_CLASS,
                )}
              >
                {showAllRecent ? "Show less" : "Show more"}
              </button>
            ) : null}
          </TopicSection>
        ) : null}
      </div>

      <div className="flex items-center gap-1 p-2">
        <div className="hover:bg-foreground/[0.035] flex max-w-[calc(100%-2rem)] min-w-0 items-center gap-2 rounded-md px-2 py-1.5 transition-colors">
          <div className="bg-primary/70 text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium">
            {initial}
          </div>
          <span className="text-foreground/84 min-w-0 truncate text-[13px] leading-[18px] font-normal">
            {displayName}
            <span className="text-foreground/30"> · </span>
            <span className="text-foreground/52">{userPlan}</span>
          </span>
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

export const CurriculumSidebar = memo(CurriculumSidebarComponent);
