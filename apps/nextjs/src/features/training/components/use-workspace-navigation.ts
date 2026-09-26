"use client";

import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";

const LAST_SESSION_COOKIE = "bp-last-learning-session";

/**
 * Owns where the learner is in the workspace — the selected session and chat,
 * the sidebar's open/collapsed state — and keeps the URL and last-session
 * cookie in sync with it. Guards that need projection data (which node is
 * live, which advance is pending) stay with the composition root; this
 * controller only knows about selection.
 */
export function useWorkspaceNavigation({
  initialSessionId,
  initialChatId,
}: {
  initialSessionId: string;
  initialChatId: string | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    initialChatId,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((collapsed) => !collapsed);
  }, []);
  const openMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(true);
  }, []);
  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileSidebarOpen]);

  useEffect(() => {
    document.cookie = `${LAST_SESSION_COOKIE}=${selectedSessionId}; path=/; SameSite=Lax`;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("session")) {
      params.set("session", selectedSessionId);
      window.history.replaceState(null, "", `/workspace?${params.toString()}`);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    const syncSelectionFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setSelectedSessionId(params.get("session") ?? initialSessionId);
      setSelectedChatId(params.get("chat"));
      setMobileSidebarOpen(false);
    };

    window.addEventListener("popstate", syncSelectionFromUrl);
    return () => window.removeEventListener("popstate", syncSelectionFromUrl);
  }, [initialSessionId]);

  const navigate = useCallback(
    (nextSessionId: string, nextChatId: string | null) => {
      setSelectedSessionId(nextSessionId);
      setSelectedChatId(nextChatId);
      setMobileSidebarOpen(false);

      const params = new URLSearchParams({ session: nextSessionId });
      if (nextChatId) params.set("chat", nextChatId);
      window.history.pushState(null, "", `/workspace?${params.toString()}`);
    },
    [],
  );

  const handleLink = useCallback(
    (
      event: MouseEvent<HTMLAnchorElement>,
      nextSessionId: string,
      nextChatId: string | null,
    ) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      navigate(nextSessionId, nextChatId);
    },
    [navigate],
  );

  const prefetchProject = useCallback(
    (nextSessionId: string) => {
      if (nextSessionId === selectedSessionId) return;

      // aiWorkspace is deliberately not prefetched: fetching it can trigger
      // server-side unit generation, which a mere hover must not do. The shell
      // is read-only.
      void queryClient.prefetchQuery(
        trpc.training.workspaceShell.queryOptions(
          { sessionId: nextSessionId },
          {
            staleTime: Number.POSITIVE_INFINITY,
            retry: false,
          },
        ),
      );
    },
    [queryClient, selectedSessionId, trpc],
  );

  // Stable identity so composition-root callbacks depending on the controller
  // only re-create when navigation state actually changes.
  return useMemo(
    () => ({
      selectedSessionId,
      selectedChatId,
      setSelectedChatId,
      sidebarCollapsed,
      setSidebarCollapsed,
      mobileSidebarOpen,
      toggleSidebar,
      openMobileSidebar,
      closeMobileSidebar,
      navigate,
      handleLink,
      prefetchProject,
    }),
    [
      selectedSessionId,
      selectedChatId,
      sidebarCollapsed,
      mobileSidebarOpen,
      toggleSidebar,
      openMobileSidebar,
      closeMobileSidebar,
      navigate,
      handleLink,
      prefetchProject,
    ],
  );
}

export type WorkspaceNavigation = ReturnType<typeof useWorkspaceNavigation>;
