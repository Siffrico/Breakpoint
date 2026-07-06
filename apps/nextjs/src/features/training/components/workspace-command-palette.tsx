"use client";

import type { ReactNode } from "react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUDownLeft,
  ArrowUp,
  CaretDown,
  NotePencil,
  Plus,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";

import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
  CommandShortcut,
} from "@acme/ui/command";

import { useTRPC } from "~/trpc/react";

interface ChatEntry {
  kind: "chat";
  value: string;
  label: string;
  href: string;
  keywords: string[];
}

interface ShowMoreEntry {
  kind: "show-more";
  value: string;
  label: string;
  projectId: string;
  remaining: number;
  keywords: string[];
}

type ProjectItem = ChatEntry | ShowMoreEntry;

interface ProjectGroup {
  id: string;
  value: string;
  items: ProjectItem[];
}

const COLLAPSED_CHAT_COUNT = 3;

export function WorkspaceCommandPalette({
  open,
  onOpenChange,
  onNewTopic,
  onContinueProject,
  workspaceTheme = "warm",
  preview = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewTopic?: () => void;
  onContinueProject?: (sessionId: string) => void;
  workspaceTheme?: "light" | "dark" | "warm";
  preview?: boolean;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(),
  );
  const [searchValue, setSearchValue] = useState("");

  // Warm the index during idle time after the workspace settles, so the *first*
  // ⌘K open renders instantly instead of paying a cold round-trip and showing
  // skeletons. Gating purely on `open` made every first open the first fetch;
  // the cache only ever helped the second open onward. The query itself is a
  // handful of indexed reads, so prefetching is cheap. The skeleton below now
  // only appears on a genuinely slow network where idle warming hasn't landed.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setWarm(true), 1500);
    return () => window.clearTimeout(id);
  }, []);

  // Filtering is entirely client-side once cached, so reopening is instant.
  const { data, isLoading, isError, refetch } = useQuery(
    trpc.training.listWorkspaceIndex.queryOptions(undefined, {
      enabled: open || warm,
    }),
  );

  const groups = useMemo<ProjectGroup[]>(() => {
    if (!data) return [];

    return data.map((project) => {
      const projectHref = preview
        ? "/ui/workspace"
        : `/workspace?session=${project.sessionId}`;

      const chats: ChatEntry[] = project.chats.map((chat) => ({
        kind: "chat",
        value: chat.id,
        label: chat.title,
        href: preview
          ? projectHref
          : `${projectHref}&chat=${encodeURIComponent(chat.id)}`,
        keywords: [project.title],
      }));

      // Projects without chats yet (still onboarding/generating) stay visible
      // and openable via a single fallback row.
      const allItems: ChatEntry[] =
        chats.length > 0
          ? chats
          : [
              {
                kind: "chat",
                value: project.sessionId,
                label: "Start a chat",
                href: projectHref,
                keywords: [project.title],
              },
            ];

      const isExpanded =
        expandedProjects.has(project.sessionId) || searchValue.length > 0;
      const visibleChats = isExpanded
        ? allItems
        : allItems.slice(0, COLLAPSED_CHAT_COUNT);
      const remaining = allItems.length - visibleChats.length;
      const items: ProjectItem[] =
        remaining > 0
          ? [
              ...visibleChats,
              {
                kind: "show-more",
                value: `show-more-${project.sessionId}`,
                label: "Show more",
                projectId: project.sessionId,
                remaining,
                keywords: [project.title],
              },
            ]
          : visibleChats;

      return { id: project.sessionId, value: project.title, items };
    });
  }, [data, expandedProjects, preview, searchValue]);

  const handleSelect = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const handleNewTopic = () => {
    onOpenChange(false);
    onNewTopic?.();
  };

  const handleShowMore = (projectId: string) => {
    setExpandedProjects((current) => new Set(current).add(projectId));
  };

  const handleContinueProject = (projectId: string) => {
    onOpenChange(false);
    onContinueProject?.(projectId);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogPopup
        className="bp-workspace-theme border-border bg-popover text-popover-foreground"
        data-workspace-theme={workspaceTheme}
      >
        <Command
          items={groups}
          itemToStringValue={(item) => {
            const entry = item as ProjectItem;
            return `${entry.label} ${entry.keywords.join(" ")}`;
          }}
        >
          <CommandInput
            placeholder="Search projects and chats…"
            value={searchValue}
            onChange={(event) => setSearchValue(event.currentTarget.value)}
          />
          <CommandPanel className="border-border bg-background">
            <CommandEmpty>
              {isLoading ? (
                <div
                  className="w-full space-y-2 py-0.5"
                  aria-label="Loading your workspace"
                >
                  <div className="bg-foreground/[0.07] h-5 w-2/3 animate-pulse rounded-md" />
                  <div className="bg-foreground/[0.055] h-5 w-1/2 animate-pulse rounded-md" />
                  <div className="bg-foreground/[0.055] h-5 w-3/5 animate-pulse rounded-md" />
                </div>
              ) : isError ? (
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="text-foreground/70 hover:text-foreground underline underline-offset-2"
                >
                  Couldn&apos;t load — retry
                </button>
              ) : (
                "No projects or chats match your search."
              )}
            </CommandEmpty>
            <CommandList>
              {(group: ProjectGroup) => (
                <Fragment key={group.id}>
                  <CommandGroup items={group.items} className="group/project">
                    <CommandGroupLabel className="flex items-center gap-2 px-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate">
                        {group.value}
                      </span>
                      <button
                        type="button"
                        aria-label={`Continue ${group.value}`}
                        title={`Continue ${group.value}`}
                        onClick={() => handleContinueProject(group.id)}
                        className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex size-6 items-center justify-center rounded-md opacity-0 transition-[color,background-color,opacity] group-hover/project:opacity-100 focus-visible:opacity-100"
                      >
                        <NotePencil size={15} aria-hidden="true" />
                      </button>
                    </CommandGroupLabel>
                    <CommandCollection>
                      {(item: ProjectItem) => (
                        <CommandItem
                          key={item.value}
                          value={item.value}
                          onClick={() =>
                            item.kind === "chat"
                              ? handleSelect(item.href)
                              : handleShowMore(item.projectId)
                          }
                        >
                          {item.kind === "chat" ? (
                            <>
                              <span className="min-w-0 flex-1 truncate">
                                {item.label}
                              </span>
                            </>
                          ) : (
                            <>
                              <CaretDown size={14} aria-hidden="true" />
                              <span>{item.label}</span>
                              <CommandShortcut>
                                {item.remaining} more
                              </CommandShortcut>
                            </>
                          )}
                        </CommandItem>
                      )}
                    </CommandCollection>
                  </CommandGroup>
                  <CommandSeparator />
                </Fragment>
              )}
            </CommandList>
          </CommandPanel>
          <CommandFooter className="border-border text-muted-foreground px-5 py-3">
            <div className="flex items-center gap-5">
              <span className="flex items-center gap-2">
                <span className="flex gap-1">
                  <FooterKey>
                    <ArrowUp size={13} aria-hidden="true" />
                  </FooterKey>
                  <FooterKey>
                    <ArrowDown size={13} aria-hidden="true" />
                  </FooterKey>
                </span>
                Navigate
              </span>
              <span className="flex items-center gap-2">
                <FooterKey>
                  <ArrowUDownLeft size={13} aria-hidden="true" />
                </FooterKey>
                Open
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleNewTopic}
                className="text-foreground hover:text-foreground/80 flex items-center gap-1.5 transition-colors"
              >
                <Plus size={13} aria-hidden="true" />
                New topic
                <FooterKey>⌘N</FooterKey>
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="text-foreground hover:text-foreground/80 flex items-center gap-2 transition-colors"
              >
                <FooterKey>Esc</FooterKey>
                Close
              </button>
            </div>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}

function FooterKey({ children }: { children: ReactNode }) {
  return (
    <kbd className="border-border bg-accent text-accent-foreground flex min-w-7 items-center justify-center rounded-md border px-1.5 py-1 font-sans text-[11px] shadow-sm">
      {children}
    </kbd>
  );
}
