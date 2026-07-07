"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ChalkboardTeacher,
  CreditCard,
  Gear,
  Plus,
  User,
} from "@phosphor-icons/react";
import type { Icon as PhosphorIconType } from "@phosphor-icons/react";

import { cn } from "@acme/ui";

export type SettingsTabKey = "profile" | "general" | "teachers" | "billing";

export interface TopicNavItem {
  sessionId: string;
  title: string;
  status: "active" | "building" | "onboarding";
}

interface TabDef {
  key: SettingsTabKey;
  label: string;
  icon: PhosphorIconType;
  wip?: boolean;
}

const accountTabs: readonly TabDef[] = [
  { key: "profile", label: "Profile", icon: User },
  { key: "general", label: "General", icon: Gear },
  { key: "teachers", label: "Teachers", icon: ChalkboardTeacher, wip: true },
  { key: "billing", label: "Billing", icon: CreditCard },
];

export function SettingsSidebar({
  basePath = "/settings",
  activeTab,
  topics = [],
}: {
  basePath?: string;
  activeTab?: SettingsTabKey;
  topics?: TopicNavItem[];
}) {
  return (
    <Suspense fallback={null}>
      <SettingsSidebarContent
        basePath={basePath}
        activeTab={activeTab}
        topics={topics}
      />
    </Suspense>
  );
}

function SettingsSidebarContent({
  basePath,
  activeTab,
  topics,
}: {
  basePath: string;
  activeTab?: SettingsTabKey;
  topics: TopicNavItem[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const query = sessionId ? `?session=${sessionId}` : "";
  const backHref =
    basePath === "/ui/profile"
      ? "/ui/workspace"
      : sessionId
        ? `/workspace?session=${sessionId}`
        : "/workspace";

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-5 pb-3">
        <Link
          href={backHref}
          className="text-foreground/48 hover:text-foreground/82 inline-flex items-center gap-1.5 text-[12px] outline-none transition-colors focus:outline-none focus-visible:outline-none"
        >
          <ArrowLeft size={13} weight="regular" />
          Back to app
        </Link>
        <div className="font-display text-foreground mt-3 text-[15px] font-semibold tracking-[-0.01em]">
          Settings
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-6">
        <div className="text-foreground/40 px-2.5 pt-2 pb-1 text-[11px] font-medium">
          Account
        </div>
        <div className="space-y-px">
          {accountTabs.map(({ key, label, icon: Icon, wip }) => {
            const href = `${basePath}/${key}${query}`;
            const isActive =
              activeTab !== undefined
                ? activeTab === key
                : pathname === `${basePath}/${key}`;

            return (
              <Link
                key={key}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:outline-none focus-visible:outline-none",
                  isActive
                    ? "bg-foreground/[0.06] text-foreground"
                    : "text-foreground/62 hover:text-foreground/92",
                )}
              >
                <Icon
                  size={14}
                  weight="regular"
                  className={
                    isActive ? "text-foreground/84" : "text-foreground/52"
                  }
                />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {wip ? (
                  <span className="text-foreground/34 text-[10px] font-medium tracking-[0.04em] uppercase">
                    WIP
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        {topics.length > 0 ? (
          <div className="mt-6">
            <div className="flex items-center justify-between px-2.5 pb-1">
              <span className="text-foreground/40 text-[11px] font-medium">
                Topics
              </span>
              <Link
                href={`${basePath}/topics`}
                title="Browse and import projects"
                className="text-foreground/40 hover:text-foreground/80 -mr-1 flex size-5 items-center justify-center outline-none transition-colors focus:outline-none focus-visible:outline-none"
              >
                <Plus size={13} weight="bold" />
              </Link>
            </div>
            <TopicsTree basePath={basePath} pathname={pathname} topics={topics} />
          </div>
        ) : null}
      </nav>
    </div>
  );
}

// A flat, always-expanded tree of the learner's projects. Each row navigates to
// that project's topic page (overview + skill-cluster ELO). The left rule reads
// as a single non-collapsible branch.
function TopicsTree({
  basePath,
  pathname,
  topics,
}: {
  basePath: string;
  pathname: string;
  topics: TopicNavItem[];
}) {
  return (
    <div className="border-border/70 mt-0.5 ml-3.5 border-l pl-1.5">
      {topics.map((topic) => {
        const href = `${basePath}/topics/${topic.sessionId}`;
        const isActive = pathname === href;

        return (
          <Link
            key={topic.sessionId}
            href={href}
            title={topic.title}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:outline-none focus-visible:outline-none",
              isActive
                ? "bg-foreground/[0.06] text-foreground"
                : "text-foreground/62 hover:text-foreground/92",
            )}
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                topic.status === "active"
                  ? "bg-foreground/44"
                  : "bg-foreground/20",
              )}
            />
            <span className="min-w-0 flex-1 truncate">{topic.title}</span>
          </Link>
        );
      })}
    </div>
  );
}
