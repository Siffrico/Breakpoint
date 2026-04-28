"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CaretRight,
  CircleDashed,
  DotsThree,
  Funnel,
  Gear,
  MagnifyingGlass,
  Plus,
  SidebarSimple,
  Storefront,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { toast } from "@acme/ui/toast";

import { useLocalStorage } from "~/hooks/use-local-storage";
import { useTRPC } from "~/trpc/react";

type LearningProject =
  RouterOutputs["becoming"]["listLearningProjects"][number];

const SIDEBAR_FADE_STYLE = {
  WebkitMaskImage:
    "linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) calc(100% - 18px), rgba(0,0,0,0) 100%)",
  maskImage:
    "linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) calc(100% - 18px), rgba(0,0,0,0) 100%)",
} satisfies CSSProperties;

const DOT_MATRIX_PATH: readonly number[] = [
  1, 2, 3, 9, 14, 19, 23, 22, 21, 15, 10, 5,
] as const;

const DOT_MATRIX_TAIL = [1, 0.78, 0.56, 0.36, 0.22] as const;

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return prefersReducedMotion;
}

function DotMatrixCircularLoader({
  size = 14,
  dotSize = 2,
}: {
  size?: number;
  dotSize?: number;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  const pathLength = DOT_MATRIX_PATH.length;

  useEffect(() => {
    if (prefersReducedMotion) return;

    const interval = window.setInterval(() => {
      setStep((current) => (current + 1) % pathLength);
    }, 95);

    return () => window.clearInterval(interval);
  }, [pathLength, prefersReducedMotion]);

  const dots = useMemo(() => {
    const leadA = step % pathLength;
    const leadB = (leadA + Math.floor(pathLength / 2)) % pathLength;

    return Array.from({ length: 25 }, (_, index) => {
      const row = Math.floor(index / 5);
      const col = index % 5;
      const isCorner = (row === 0 || row === 4) && (col === 0 || col === 4);
      const pathOrder = DOT_MATRIX_PATH.indexOf(index);
      const isCore = row === 2 && col === 2;

      if (isCorner) {
        return { opacity: 0 };
      }

      if (pathOrder === -1) {
        return { opacity: isCore ? 0.16 : 0.08 };
      }

      if (prefersReducedMotion) {
        return { opacity: 0.2 + (pathOrder / (pathLength - 1)) * 0.56 };
      }

      let opacity = 0.08;

      for (let tail = 0; tail < DOT_MATRIX_TAIL.length; tail += 1) {
        const weight = DOT_MATRIX_TAIL[tail] ?? 0;
        const tailA = (leadA - tail + pathLength) % pathLength;
        const tailB = (leadB - tail + pathLength) % pathLength;

        if (pathOrder === tailA) {
          opacity = Math.max(opacity, weight);
        }

        if (pathOrder === tailB) {
          opacity = Math.max(opacity, weight * 0.72);
        }
      }

      return { opacity };
    });
  }, [pathLength, prefersReducedMotion, step]);

  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center"
      style={{
        width: size,
        height: size,
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gridTemplateRows: "repeat(5, minmax(0, 1fr))",
      }}
    >
      {dots.map((dot, index) => (
        <span
          key={index}
          className="rounded-full bg-current"
          style={{
            width: dotSize,
            height: dotSize,
            opacity: dot.opacity,
          }}
        />
      ))}
    </span>
  );
}

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
      className="text-foreground/44 hover:text-foreground/80 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors outline-none focus:outline-none focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

function ChatRow({
  title,
  status,
  href,
  isRunning = false,
}: {
  title: string;
  status?: string;
  href: string;
  isRunning?: boolean;
}) {
  const isReady = status === "ready";
  const isCompleted = status === "completed";
  return (
    <Link
      href={href}
      className={[
        "group flex w-full items-center gap-2 rounded-md px-2.5 py-[6px] text-left text-[12px] transition-colors outline-none focus:outline-none focus-visible:outline-none",
        isReady
          ? "text-foreground/82"
          : isCompleted
            ? "text-foreground/46"
            : "text-foreground/46",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-[14px] w-[14px] shrink-0 items-center justify-center",
          isRunning
            ? "text-foreground/72"
            : isReady
              ? "text-foreground/60"
              : isCompleted
                ? "text-foreground/28"
                : "text-foreground/18",
        ].join(" ")}
      >
        {isRunning ? (
          <DotMatrixCircularLoader />
        ) : (
          <CircleDashed size={14} className="shrink-0" />
        )}
      </span>
      <FadeLabel className="min-w-0 flex-1 leading-5">{title}</FadeLabel>
    </Link>
  );
}

function ProjectRow({
  project,
  href,
  isCurrent,
  isExpanded,
  activeLessonId,
  isSessionRunning,
  onToggle,
}: {
  project: LearningProject;
  href: string;
  isCurrent: boolean;
  isExpanded: boolean;
  activeLessonId?: string | null;
  isSessionRunning?: boolean;
  onToggle: () => void;
}) {
  const lessons = project.lessonPreview.slice(0, 3);
  const runningLessonId =
    activeLessonId ?? lessons.find((lesson) => lesson.status === "ready")?.id;

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
          "flex w-full items-center gap-1.5 rounded-md py-[7px] pr-2.5 pl-1.5 text-left text-[12px] font-medium transition-colors outline-none focus:outline-none focus-visible:outline-none",
          isCurrent
            ? "bg-foreground/[0.06] text-foreground/92"
            : "text-foreground/78 hover:text-foreground/92",
        ].join(" ")}
      >
        <CaretRight
          size={12}
          weight="bold"
          className={[
            "text-foreground/40 shrink-0 transition-transform duration-150",
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
              isRunning={
                Boolean(isSessionRunning && isCurrent) &&
                lesson.id === runningLessonId
              }
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
  activeLessonId,
  isSessionRunning = false,
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
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const profileHref = preview
    ? "/ui/profile"
    : `/profile?session=${currentSessionId}`;

  const startOnboarding = useMutation(
    trpc.becoming.startOnboarding.mutationOptions({
      onSuccess: (data) => {
        router.push(`/workspace?session=${data.sessionId}`);
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
      <aside className="bg-sidebar text-sidebar-foreground flex h-full flex-col">
        <div className="flex h-14 items-center justify-center">
          <IconButton label="Open sidebar" onClick={onToggleCollapsed}>
            <SidebarSimple size={15} />
          </IconButton>
        </div>

        <div className="flex flex-col items-center gap-1 px-2 pt-2">
          <IconButton label="New project" onClick={handleNewProject}>
            <Plus size={15} weight="bold" />
          </IconButton>
          <Link href="/courses" aria-label="Courses">
            <IconButton label="Courses">
              <Storefront size={15} />
            </IconButton>
          </Link>
        </div>

        <div className="flex-1" />

        <div className="flex flex-col items-center gap-2 py-3">
          <Link
            href={profileHref}
            aria-label="Settings"
            className="text-foreground/44 hover:text-foreground/80 flex h-7 w-7 items-center justify-center transition-colors outline-none focus:outline-none focus-visible:outline-none"
          >
            <Gear size={14} />
          </Link>
          <div className="bg-primary/70 text-primary-foreground flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold">
            {initial}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="bg-sidebar text-sidebar-foreground flex h-full flex-col">
      {/* Top icon row */}
      <div className="flex h-14 items-center justify-between px-2">
        <div className="flex items-center gap-0.5">
          <IconButton label="Collapse sidebar" onClick={onToggleCollapsed}>
            <SidebarSimple size={15} />
          </IconButton>
          <IconButton label="Search">
            <MagnifyingGlass size={15} />
          </IconButton>
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-2 pt-1">
        <button
          type="button"
          onClick={handleNewProject}
          disabled={startOnboarding.isPending}
          className="hover:bg-foreground/[0.04] flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors outline-none focus:outline-none focus-visible:outline-none disabled:opacity-50"
        >
          <Plus
            size={15}
            weight="bold"
            className="text-foreground/64 shrink-0"
          />
          <FadeLabel className="text-foreground/82 min-w-0 flex-1 text-[12px] font-medium">
            New topic
          </FadeLabel>
          <span className="text-foreground/34 shrink-0 font-mono text-[10px]">
            ⌘N
          </span>
        </button>

        <Link
          href="/courses"
          className="hover:bg-foreground/[0.04] mt-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors outline-none focus:outline-none focus-visible:outline-none"
        >
          <Storefront size={15} className="text-foreground/44 shrink-0" />
          <FadeLabel className="text-foreground/64 min-w-0 flex-1 text-[12px] font-medium">
            Courses
          </FadeLabel>
        </Link>
      </div>

      {/* Scrollable projects list (each project = a header with its chats under it) */}
      <div className="flex-1 overflow-y-auto px-2 pt-4 pb-2">
        {projects.length > 0 ? (
          <div className="text-foreground/36 px-2.5 pb-1.5 text-[10px] font-medium tracking-[0.08em] uppercase">
            Projects
          </div>
        ) : null}

        {projects.length === 0 ? (
          <div className="text-foreground/34 px-3 pt-4 text-[11px] leading-5">
            No projects yet. Start a new one above.
          </div>
        ) : null}

        <div className="space-y-1">
          {projects.map((project) => {
            const isCurrent = project.sessionId === currentSessionId;
            const isExpanded = expanded[project.sessionId] ?? isCurrent;
            const href = preview
              ? "/ui/workspace"
              : `/workspace?session=${project.sessionId}`;
            return (
              <ProjectRow
                key={project.sessionId}
                project={project}
                href={href}
                isCurrent={isCurrent}
                isExpanded={isExpanded}
                activeLessonId={activeLessonId}
                isSessionRunning={isSessionRunning}
                onToggle={() => toggleProject(project.sessionId, isCurrent)}
              />
            );
          })}
        </div>

        {projects.length > 5 ? (
          <button
            type="button"
            className="text-foreground/44 hover:text-foreground/70 mt-3 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors"
          >
            <DotsThree size={16} weight="bold" className="shrink-0" />
            <FadeLabel className="min-w-0 flex-1 text-[12px] font-medium">
              More
            </FadeLabel>
          </button>
        ) : null}
      </div>

      {/* Footer: user */}
      <div className="border-foreground/[0.05] flex items-center gap-2 border-t px-2 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1">
          <div className="bg-primary/70 text-primary-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <FadeLabel className="text-foreground/84 text-[12px] leading-4 font-medium">
              {displayName}
            </FadeLabel>
            <FadeLabel className="text-foreground/40 text-[10px] leading-4">
              {userPlan}
            </FadeLabel>
          </div>
        </div>
        <Link
          href={profileHref}
          aria-label="Settings"
          className="text-foreground/44 hover:text-foreground/80 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors outline-none focus:outline-none focus-visible:outline-none"
        >
          <Gear size={14} />
        </Link>
      </div>
    </aside>
  );
}
