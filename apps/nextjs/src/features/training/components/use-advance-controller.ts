"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@acme/ui/toast";

import type {
  AiWorkspace,
  LearningProject,
  UnitAdvanceGate,
  WorkspaceMode,
} from "./use-workspace-session";
import { useTRPC } from "~/trpc/react";

export interface AdvanceTransition {
  sessionId: string;
  completedNodeId: string;
  projectedNodeId: string;
  title: string;
}
interface AdvanceMutationContext {
  previousAdvanceTransition: AdvanceTransition | null;
  previousSelectedChatId: string | null;
  transition: AdvanceTransition;
}

// The aiWorkspace query is otherwise bootstrap-frozen (staleTime: Infinity),
// so while a transition is pending the controller polls for the server-side
// advance it is waiting to reconcile against.
const ADVANCE_POLL_INTERVAL_MS = 30_000;

/**
 * Owns the "Next unit" flow end to end: the optimistic transition shown while
 * the server advances, rollback on failure, reconciliation once the server
 * catches up, and the sidebar projection that shows the projected next lesson.
 */
export function useAdvanceController({
  selectedSessionId,
  selectedChatId,
  setSelectedChatId,
  aiWorkspace,
  serverProjects,
  unitAdvanceGate,
  mode,
  isHistorySelected,
  isSessionRunning,
  preview,
}: {
  selectedSessionId: string;
  selectedChatId: string | null;
  setSelectedChatId: (chatId: string | null) => void;
  aiWorkspace: AiWorkspace | null;
  serverProjects: LearningProject[];
  unitAdvanceGate: UnitAdvanceGate;
  mode: WorkspaceMode;
  isHistorySelected: boolean;
  isSessionRunning: boolean;
  preview: boolean;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [advanceTransition, setAdvanceTransition] =
    useState<AdvanceTransition | null>(null);
  const activeTransition =
    advanceTransition?.sessionId === selectedSessionId
      ? advanceTransition
      : null;

  useEffect(() => {
    if (!activeTransition) return;

    const serverActiveNodeId = aiWorkspace?.state?.activeUnitId;
    const serverProject = serverProjects.find(
      (project) => project.sessionId === activeTransition.sessionId,
    );
    const serverAdvanced = Boolean(
      serverActiveNodeId &&
        serverActiveNodeId !== activeTransition.completedNodeId,
    );
    const serverProjectHasNextNode = Boolean(
      serverActiveNodeId &&
        serverProject?.lessonPreview.some(
          (lesson) => lesson.id === serverActiveNodeId,
        ),
    );

    if (serverAdvanced && !serverProjectHasNextNode) {
      void queryClient.invalidateQueries({
        queryKey: trpc.training.listLearningProjects.queryKey(),
      });
    }

    if (aiWorkspace?.projectComplete || serverAdvanced) {
      const frameId = window.requestAnimationFrame(() => {
        setAdvanceTransition((current) =>
          current === activeTransition ? null : current,
        );
      });
      return () => window.cancelAnimationFrame(frameId);
    }
  }, [
    activeTransition,
    queryClient,
    aiWorkspace,
    serverProjects,
    trpc.training.listLearningProjects,
  ]);

  useEffect(() => {
    if (!activeTransition || isHistorySelected) return;

    const intervalId = window.setInterval(() => {
      void queryClient.invalidateQueries({
        queryKey: trpc.training.aiWorkspace.queryKey({
          sessionId: activeTransition.sessionId,
        }),
      });
    }, ADVANCE_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [
    activeTransition,
    isHistorySelected,
    queryClient,
    trpc.training.aiWorkspace,
  ]);

  const restoreAdvanceTransition = useCallback(
    (context: AdvanceMutationContext | undefined) => {
      setAdvanceTransition(context?.previousAdvanceTransition ?? null);
      setSelectedChatId(context?.previousSelectedChatId ?? null);
    },
    [setSelectedChatId],
  );

  const advanceCompletedUnit = useMutation(
    trpc.training.advanceCompletedUnit.mutationOptions({
      onMutate: (variables): AdvanceMutationContext => {
        const previousSelectedChatId = selectedChatId;
        const nextTitle =
          unitAdvanceGate.status === "enabled"
            ? (unitAdvanceGate.nextTitle ?? "Next unit")
            : "Next unit";
        const transition: AdvanceTransition = {
          sessionId: variables.sessionId,
          completedNodeId: variables.nodeId,
          projectedNodeId: crypto.randomUUID(),
          title: nextTitle,
        };

        setAdvanceTransition(transition);
        setSelectedChatId(null);

        return {
          previousAdvanceTransition: advanceTransition,
          previousSelectedChatId,
          transition,
        };
      },
      onSuccess: (result, _variables, context) => {
        const sessionInput = {
          sessionId: context.transition.sessionId,
        };
        const workspaceKey = trpc.training.aiWorkspace.queryKey(sessionInput);
        const projectsKey = trpc.training.listLearningProjects.queryKey();

        if (!result.advanced) {
          restoreAdvanceTransition(context);
          router.push(
            `/workspace/mission?unitRunId=${encodeURIComponent(result.unitRunId)}`,
          );
          return;
        }
        if (result.nextChat) {
          const { nodeId, title } = result.nextChat;
          setAdvanceTransition((current) =>
            current === context.transition
              ? { ...current, projectedNodeId: nodeId, title }
              : current,
          );
        }
        void queryClient.invalidateQueries({ queryKey: projectsKey });
        void queryClient.invalidateQueries({
          queryKey: workspaceKey,
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.training.workspaceShell.queryKey(sessionInput),
        });
      },
      onError: (error, _variables, context) => {
        restoreAdvanceTransition(context);
        toast.error(error.message);
      },
    }),
  );

  const canAdvance =
    mode === "unit" &&
    activeTransition == null &&
    aiWorkspace?.state?.recallUnitId == null &&
    unitAdvanceGate.status === "enabled";

  const advance = useCallback(() => {
    if (
      !canAdvance ||
      preview ||
      isSessionRunning ||
      advanceCompletedUnit.isPending
    ) {
      return;
    }

    advanceCompletedUnit.mutate({
      sessionId: selectedSessionId,
      nodeId: unitAdvanceGate.unitId,
    });
  }, [
    advanceCompletedUnit,
    canAdvance,
    isSessionRunning,
    preview,
    selectedSessionId,
    unitAdvanceGate,
  ]);

  // Sidebar projection: while the transition is pending the projected next
  // lesson is shown at the top of the selected project's preview.
  const resolvedProjects = useMemo(() => {
    if (!activeTransition) return serverProjects;
    return serverProjects.map((project) => {
      if (
        project.sessionId !== selectedSessionId ||
        project.lessonPreview.some(
          (lesson) => lesson.id === activeTransition.projectedNodeId,
        )
      ) {
        return project;
      }
      return {
        ...project,
        lessonPreview: [
          {
            id: activeTransition.projectedNodeId,
            title: activeTransition.title,
            status: "ready" as const,
          },
          ...project.lessonPreview,
        ],
      };
    });
  }, [activeTransition, selectedSessionId, serverProjects]);

  const isPending = advanceCompletedUnit.isPending;
  return useMemo(
    () => ({
      activeTransition,
      pendingNodeId: activeTransition?.projectedNodeId ?? null,
      canAdvance,
      isPending,
      advance,
      resolvedProjects,
    }),
    [activeTransition, canAdvance, isPending, advance, resolvedProjects],
  );
}

export type AdvanceController = ReturnType<typeof useAdvanceController>;
