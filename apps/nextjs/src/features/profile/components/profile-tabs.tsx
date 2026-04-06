"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@acme/ui";

export type ProfileTabKey = "general" | "preferences" | "customization";

const tabs: Array<{ key: ProfileTabKey; label: string }> = [
  { key: "general", label: "General" },
  { key: "preferences", label: "Preferences" },
  { key: "customization", label: "Customization" },
];

export function ProfileTabs({
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

  return (
    <div className="flex flex-wrap items-end gap-10 pb-4 text-sm">
      {tabs.map((tab) => {
        const href = `${basePath}/${tab.key}${query}`;
        const isActive =
          activeTab !== undefined
            ? activeTab === tab.key
            : pathname === `${basePath}/${tab.key}`;

        return (
          <Link
            key={tab.key}
            href={href}
            className={cn(
              "tracking-[-0.01em] text-muted-foreground transition-colors hover:text-foreground",
              isActive && "font-medium text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
