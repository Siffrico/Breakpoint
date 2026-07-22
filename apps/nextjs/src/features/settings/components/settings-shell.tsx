"use client";

import { Suspense } from "react";

import { useTheme } from "@acme/ui/theme";

import type { SettingsTabKey, TopicNavItem } from "./settings-nav";
import { SettingsSidebar } from "./settings-nav";

const EMPTY_TOPICS: TopicNavItem[] = [];

export function SettingsShell({
  basePath = "/settings",
  activeTab,
  topics = EMPTY_TOPICS,
  children,
}: {
  basePath?: string;
  activeTab?: SettingsTabKey;
  topics?: TopicNavItem[];
  children: React.ReactNode;
}) {
  // Settings surfaces are painted via `data-workspace-theme`. Drive it from the
  // global theme the "Interface theme" card writes so light/dark actually flips
  // here instead of staying pinned to the stale `bp-workspace-theme` value.
  const { resolvedTheme } = useTheme();

  return (
    <div
      className="bp-workspace-theme bg-background text-foreground flex h-dvh overflow-hidden"
      data-workspace-theme={resolvedTheme}
    >
      <aside className="border-sidebar-border bg-sidebar hidden w-[200px] shrink-0 flex-col border-r md:flex">
        <Suspense fallback={null}>
          <SettingsSidebar
            basePath={basePath}
            activeTab={activeTab}
            topics={topics}
          />
        </Suspense>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-8 pt-8 pb-20 sm:px-12">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

export function SettingsPageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h1 className="text-foreground text-[18px] font-semibold">{title}</h1>
      {description ? (
        <p className="text-foreground/48 mt-1 text-[13px] leading-6">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function SettingsSection({
  title,
  children,
  className,
  radius = "xl",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  radius?: "lg" | "xl";
}) {
  return (
    <section
      aria-label={title}
      className={["mt-6", className].filter(Boolean).join(" ")}
    >
      <div
        className={
          radius === "lg"
            ? "divide-border/60 border-border/50 bg-secondary divide-y overflow-hidden rounded-lg border"
            : "divide-border/60 border-border/50 bg-secondary divide-y overflow-hidden rounded-xl border"
        }
      >
        {children}
      </div>
    </section>
  );
}

export function SettingRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-5">
      <div className="min-w-0 flex-1">
        <div className="text-foreground text-[13px] font-medium">{label}</div>
        {description ? (
          <div className="text-foreground/50 mt-0.5 text-[12px] leading-5">
            {description}
          </div>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function SettingField({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-5">
      <div className="text-foreground text-[13px] font-medium">{label}</div>
      {description ? (
        <div className="text-foreground/50 mt-0.5 text-[12px] leading-5">
          {description}
        </div>
      ) : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function SettingFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 px-5 py-3">
      {children}
    </div>
  );
}
