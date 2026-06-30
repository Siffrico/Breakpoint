"use client";

import { Fragment, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowUDownLeft, Plus } from "@phosphor-icons/react";
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
  value: string;
  label: string;
  status: string;
  href: string;
  keywords: string[];
}

interface ProjectGroup {
  value: string;
  items: ChatEntry[];
}

const STATUS_LABELS: Record<string, string> = {
  ready: "ready",
  completed: "done",
  planned: "planned",
};

function statusLabel(status: string): string | null {
  if (!status) return null;
  return STATUS_LABELS[status] ?? status;
}

export function WorkspaceCommandPalette({
  open,
  onOpenChange,
  onNewTopic,
  preview = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewTopic?: () => void;
  preview?: boolean;
}) {
  const router = useRouter();
  const trpc = useTRPC();

  // Loads only once the palette is first opened, then tRPC caches it, so
  // reopening is instant. All filtering happens client-side (zero latency).
  const { data, isLoading, isError, refetch } = useQuery(
    trpc.training.listWorkspaceIndex.queryOptions(undefined, {
      enabled: open,
    }),
  );

  const groups = useMemo<ProjectGroup[]>(() => {
    if (!data) return [];

    return data.map((project) => {
      const projectHref = preview
        ? "/ui/workspace"
        : `/workspace?session=${project.sessionId}`;

      const chats: ChatEntry[] = project.chats.map((chat) => ({
        value: chat.id,
        label: chat.title,
        status: chat.status,
        href: projectHref,
        keywords: [project.title],
      }));

      // Projects without chats yet (still onboarding/generating) stay visible
      // and openable via a single fallback row.
      const items =
        chats.length > 0
          ? chats
          : [
              {
                value: project.sessionId,
                label: "Open workspace",
                status: "",
                href: projectHref,
                keywords: [project.title],
              },
            ];

      return { value: project.title, items };
    });
  }, [data, preview]);

  const handleSelect = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const handleNewTopic = () => {
    onOpenChange(false);
    onNewTopic?.();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogPopup className="bg-secondary text-secondary-foreground">
        <Command
          items={groups}
          itemToStringValue={(item) => {
            const entry = item as ChatEntry;
            return `${entry.label} ${entry.keywords.join(" ")}`;
          }}
        >
          <CommandInput placeholder="Search projects and chats…" />
          <CommandPanel className="bg-secondary">
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
                <Fragment key={group.value}>
                  <CommandGroup items={group.items}>
                    <CommandGroupLabel>{group.value}</CommandGroupLabel>
                    <CommandCollection>
                      {(item: ChatEntry) => (
                        <CommandItem
                          key={item.value}
                          value={item.value}
                          onClick={() => handleSelect(item.href)}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {item.label}
                          </span>
                          {statusLabel(item.status) ? (
                            <CommandShortcut>
                              {statusLabel(item.status)}
                            </CommandShortcut>
                          ) : null}
                        </CommandItem>
                      )}
                    </CommandCollection>
                  </CommandGroup>
                  <CommandSeparator />
                </Fragment>
              )}
            </CommandList>
          </CommandPanel>
          <CommandFooter>
            <span className="flex items-center gap-1.5">
              <ArrowUDownLeft size={13} aria-hidden="true" />
              open
            </span>
            <button
              type="button"
              onClick={handleNewTopic}
              className="hover:text-foreground flex items-center gap-1.5 transition-colors"
            >
              <Plus size={13} aria-hidden="true" />
              New topic
              <CommandShortcut>⌘N</CommandShortcut>
            </button>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
