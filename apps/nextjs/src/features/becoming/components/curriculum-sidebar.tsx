"use client";

import Link from "next/link";
import {
  CaretRight,
  DotsThree,
  Funnel,
  Gear,
  MagnifyingGlass,
  Plus,
  SidebarSimple,
  Storefront,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type CSSProperties, type ReactNode } from "react";

import type { RouterOutputs } from "@acme/api";
import { toast } from "@acme/ui/toast";

import { useLocalStorage } from "~/hooks/use-local-storage";
import { useTRPC } from "~/trpc/react";

type LearningProject = RouterOutputs["becoming"]["listLearningProjects"][number];

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
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-foreground/44 outline-none transition-colors hover:bg-foreground/[0.05] hover:text-foreground/80 focus:outline-none focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

function ChatRow({
  title,
  status,
  href,
}: {
  title: string;
  status?: string;
  href: string;
}) {
  const isReady = status === "ready";
  const isCompleted = status === "completed";
  return (
    <Link
      href={href}
      className={[
        "group flex w-full items-center gap-2 rounded-md px-2.5 py-[6px] text-left text-[12px] outline-none transition-colors focus:outline-none focus-visible:outline-none",
        isReady
          ? "text-foreground/82 hover:bg-foreground/[0.035]"
          : isCompleted
            ? "text-foreground/46 hover:bg-foreground/[0.035]"
            : "text-foreground/46 hover:bg-foreground/[0.035]",
      ].join(" ")}
    >
      <span
        className={[
          "h-[4px] w-[4px] shrink-0 rounded-full",
          isReady
            ? "bg-foreground/60"
            : isCompleted
              ? "bg-foreground/28"
              : "bg-foreground/18",
        ].join(" ")}
      />
      <FadeLabel className="min-w-0 flex-1 leading-5">{title}</FadeLabel>
    </Link>
  );
}

function ProjectRow({
  project,
  href,
  isCurrent,
  isExpanded,
  onToggle,
}: {
  project: LearningProject;
  href: string;
  isCurrent: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const lessons = project.lessonPreview.slice(0, 3);
  return (
    <div>
      <button
        type="button"
        onClick={(event) => {
          event.currentTarget.blur();
          onToggle();
        }}
        aria-expanded={isExpanded}
        className={[
          "flex w-full items-center gap-1.5 rounded-md pl-1.5 pr-2.5 py-[7px] text-left text-[12px] font-medium outline-none transition-colors focus:outline-none focus-visible:outline-none",
          isCurrent
            ? "bg-foreground/[0.06] text-foreground/92"
            : "text-foreground/78 hover:bg-foreground/[0.035] hover:text-foreground/92",
        ].join(" ")}
      >
        <CaretRight
          size={12}
          weight="bold"
          className={[
            "shrink-0 text-foreground/40 transition-transform duration-150",
            isExpanded ? "rotate-90" : "",
          ].join(" ")}
        />
        <FadeLabel className="min-w-0 flex-1 leading-5">
          {project.title}
        </FadeLabel>
      </button>

      {isExpanded && lessons.length > 0 ? (
        <div className="mt-px">
          {lessons.map((lesson) => (
            <ChatRow
              key={lesson.id}
              title={lesson.title}
              status={lesson.status}
              href={href}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CurriculumSidebar({
  projects = [],
  currentSessionId,
  preview = false,
  collapsed = false,
  onToggleCollapsed,
  userName,
  userPlan = "Free Plan",
}: {
  projects?: LearningProject[];
  currentSessionId: string;
  preview?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  userName?: string;
  userPlan?: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const profileHref = preview ? "/ui/profile" : `/profile?session=${currentSessionId}`;

  const startOnboarding = useMutation(
    trpc.becoming.startOnboarding.mutationOptions({
      onSuccess: (data) => {
        router.push(`/home?session=${data.sessionId}`);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const handleNewProject = () => {
    if (preview || startOnboarding.isPending) return;
    startOnboarding.mutate();
  };

  const [expanded, setExpanded] = useLocalStorage<Record<string, boolean>>(
    "bp-sidebar-expanded",
    {},
  );

  const toggleProject = (sessionId: string, currentDefault: boolean) => {
    setExpanded((prev) => {
      const isOpen = prev[sessionId] ?? currentDefault;
      return { ...prev, [sessionId]: !isOpen };
    });
  };

  const displayName = userName ?? "You";
  const initial = displayName.trim().charAt(0).toUpperCase() || "·";

  if (collapsed) {
    return (
      <aside className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex h-10 items-center justify-center border-b border-foreground/[0.05]">
          <IconButton label="Open sidebar" onClick={onToggleCollapsed}>
            <SidebarSimple size={15} />
          </IconButton>
        </div>

        <div className="flex flex-col items-center gap-1 px-2 pt-2">
          <IconButton label="New project" onClick={handleNewProject}>
            <Plus size={15} weight="bold" />
          </IconButton>
          <IconButton label="Marketplace">
            <Storefront size={15} />
          </IconButton>
        </div>

        <div className="flex-1" />

        <div className="flex items-center justify-center border-t border-foreground/[0.05] py-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/70 text-[10px] font-semibold text-primary-foreground">
            {initial}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Top icon row */}
      <div className="flex h-10 items-center justify-between px-2">
        <div className="flex items-center gap-0.5">
          <IconButton label="Collapse sidebar" onClick={onToggleCollapsed}>
            <SidebarSimple size={15} />
          </IconButton>
          <IconButton label="Search">
            <MagnifyingGlass size={15} />
          </IconButton>
        </div>
        <IconButton label="Toggle panel">
          <SidebarSimple size={15} className="rotate-180" />
        </IconButton>
      </div>

      {/* Quick actions */}
      <div className="px-2 pt-1">
        <button
          type="button"
          onClick={handleNewProject}
          disabled={startOnboarding.isPending}
          className="flex w-full items-center gap-2.5 rounded-md bg-foreground/[0.05] px-2.5 py-2 text-left outline-none transition-colors hover:bg-foreground/[0.07] focus:outline-none focus-visible:outline-none disabled:opacity-50"
        >
          <Plus size={15} weight="bold" className="shrink-0 text-foreground/70" />
          <FadeLabel className="min-w-0 flex-1 text-[12px] font-medium text-foreground/86">
            Learn something new
          </FadeLabel>
          <span className="shrink-0 font-mono text-[10px] text-foreground/36">
            ⌘N
          </span>
        </button>

        <button
          type="button"
          className="mt-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left outline-none transition-colors hover:bg-foreground/[0.04] focus:outline-none focus-visible:outline-none"
        >
          <Storefront size={15} className="shrink-0 text-foreground/46" />
          <FadeLabel className="min-w-0 flex-1 text-[12px] font-medium text-foreground/64">
            Courses
          </FadeLabel>
        </button>
      </div>

      {/* Scrollable projects list (each project = a header with its chats under it) */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 pt-2">
        {projects.length === 0 ? (
          <div className="px-3 pt-4 text-[11px] leading-5 text-foreground/34">
            No projects yet. Start a new one above.
          </div>
        ) : null}

        <div className="space-y-2">
          {projects.map((project) => {
            const isCurrent = project.sessionId === currentSessionId;
            const isExpanded = expanded[project.sessionId] ?? isCurrent;
            const href = preview
              ? "/ui/home"
              : `/home?session=${project.sessionId}`;
            return (
              <ProjectRow
                key={project.sessionId}
                project={project}
                href={href}
                isCurrent={isCurrent}
                isExpanded={isExpanded}
                onToggle={() => toggleProject(project.sessionId, isCurrent)}
              />
            );
          })}
        </div>

        {projects.length > 5 ? (
          <button
            type="button"
            className="mt-3 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-foreground/44 transition-colors hover:bg-foreground/[0.035] hover:text-foreground/70"
          >
            <DotsThree size={16} weight="bold" className="shrink-0" />
            <FadeLabel className="min-w-0 flex-1 text-[12px] font-medium">
              More
            </FadeLabel>
          </button>
        ) : null}
      </div>

      {/* Footer: user */}
      <div className="flex items-center gap-2 border-t border-foreground/[0.05] px-2 py-2">
        <Link
          href={profileHref}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 outline-none transition-colors hover:bg-foreground/[0.04] focus:outline-none focus-visible:outline-none"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/70 text-[11px] font-semibold text-primary-foreground">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <FadeLabel className="text-[12px] font-medium leading-4 text-foreground/84">
              {displayName}
            </FadeLabel>
            <FadeLabel className="text-[10px] leading-4 text-foreground/40">
              {userPlan}
            </FadeLabel>
          </div>
        </Link>
        <IconButton label="Filters">
          <Funnel size={14} />
        </IconButton>
        <IconButton label="Settings">
          <Gear size={14} />
        </IconButton>
      </div>
    </aside>
  );
}
