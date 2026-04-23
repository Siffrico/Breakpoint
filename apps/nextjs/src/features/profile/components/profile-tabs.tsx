"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Brain,
  Gear,
  User,
  type Icon as PhosphorIconType,
} from "@phosphor-icons/react";

import { cn } from "@acme/ui";

export type ProfileTabKey = "general" | "preferences" | "customization";

type TabDef = {
  key: ProfileTabKey;
  label: string;
  icon: PhosphorIconType;
};

const accountTabs: readonly TabDef[] = [
  { key: "general", label: "General", icon: User },
  { key: "preferences", label: "Preferences", icon: Gear },
  { key: "customization", label: "Customization", icon: Brain },
];

export function ProfileSidebar({
  basePath = "/profile",
  activeTab,
}: {
  basePath?: string;
  activeTab?: ProfileTabKey;
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
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-6">
        <div className="text-foreground/40 px-2.5 pt-2 pb-1 text-[11px] font-medium">
          Account
        </div>
        <div className="space-y-px">
          {accountTabs.map(({ key, label, icon: Icon }) => {
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
                  "flex items-center gap-2 px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:outline-none focus-visible:outline-none",
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
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
