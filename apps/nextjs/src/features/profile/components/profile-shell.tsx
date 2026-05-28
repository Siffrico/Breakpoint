"use client";

import { Suspense } from "react";

import { useLocalStorage } from "~/hooks/use-local-storage";

import { ProfileSidebar  } from "./profile-tabs";
import type {ProfileTabKey} from "./profile-tabs";

type WorkspaceTheme = "light" | "dark" | "warm";

export function ProfileShell({
  basePath = "/profile",
  activeTab,
  children,
}: {
  basePath?: string;
  activeTab?: ProfileTabKey;
  children: React.ReactNode;
}) {
  const [workspaceTheme] = useLocalStorage<WorkspaceTheme>(
    "bp-workspace-theme",
    "warm",
  );

  return (
    <div
      className="bp-workspace-theme bg-background text-foreground flex h-dvh overflow-hidden"
      data-workspace-theme={workspaceTheme}
    >
      <aside className="border-sidebar-border bg-sidebar flex w-[220px] shrink-0 flex-col border-r">
        <Suspense fallback={null}>
          <ProfileSidebar basePath={basePath} activeTab={activeTab} />
        </Suspense>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-8 pt-12 pb-20 sm:px-12">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

export function SettingsPageHeader({ title }: { title: string }) {
  return (
    <h1 className="font-display text-foreground text-[22px] font-semibold tracking-[-0.02em]">
      {title}
    </h1>
  );
}

export function SettingsSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={["mt-10", className].filter(Boolean).join(" ")}>
      <h2 className="font-display text-foreground/84 mb-3 text-[13px] font-semibold">
        {title}
      </h2>
      <div className="divide-border border-border bg-card divide-y border">
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
    <div className="flex items-center justify-between gap-6 px-5 py-4">
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
    <div className="px-5 py-4">
      <div className="text-foreground text-[13px] font-medium">{label}</div>
      {description ? (
        <div className="text-foreground/50 mt-0.5 text-[12px] leading-5">
          {description}
        </div>
      ) : null}
      <div className="mt-3">{children}</div>
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
