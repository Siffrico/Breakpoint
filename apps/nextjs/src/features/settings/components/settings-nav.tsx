"use client";

import type { Icon as PhosphorIconType } from "@phosphor-icons/react";
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
      <div className="px-2 pt-4 pb-1">
        <Link
          href={backHref}
          className="text-foreground/50 hover:bg-foreground/[0.04] hover:text-foreground/82 flex h-8 items-center gap-2 rounded-lg px-2.5 text-[12.5px] transition-colors outline-none focus:outline-none focus-visible:outline-none"
        >
          <ArrowLeft size={15} weight="regular" />
          Back
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-6">
        <div className="space-y-0.5 pt-1">
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
                  "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors outline-none focus:outline-none focus-visible:outline-none",
                  isActive
                    ? "bg-foreground/10 text-foreground font-medium"
                    : "text-foreground/68 hover:bg-foreground/[0.05] hover:text-foreground/94",
                )}
              >
                <Icon
                  size={16}
                  weight="regular"
                  className={
                    isActive ? "text-foreground/88" : "text-foreground/58"
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
          <div className="mt-4">
            <div className="flex items-center justify-between px-2.5 pt-3 pb-1">
              <span className="text-foreground/42 text-[11px] font-medium">
                Topics
              </span>
              <Link
                href={`${basePath}/topics`}
                title="Browse and import projects"
                className="text-foreground/40 hover:text-foreground/80 -mr-1 flex size-5 items-center justify-center transition-colors outline-none focus:outline-none focus-visible:outline-none"
              >
                <Plus size={13} weight="bold" />
              </Link>
            </div>
            <TopicsTree
              basePath={basePath}
              pathname={pathname}
              topics={topics}
            />
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
    <div className="border-border/50 mt-0.5 ml-3.5 border-l pl-1.5">
      {topics.map((topic) => {
        const href = `${basePath}/topics/${topic.sessionId}`;
        const isActive = pathname === href;

        return (
          <Link
            key={topic.sessionId}
            href={href}
            title={topic.title}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors outline-none focus:outline-none focus-visible:outline-none",
              isActive
                ? "bg-foreground/[0.06] text-foreground font-medium"
                : "text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground/90",
            )}
          >
            <span
              className={cn(
                "size-1 shrink-0 rounded-full",
                topic.status === "active"
                  ? "bg-foreground/44"
                  : "bg-foreground/24",
              )}
            />
            <span className="min-w-0 flex-1 truncate">{topic.title}</span>
          </Link>
        );
      })}
    </div>
  );
}
