import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RouterOutputs } from "@acme/api";

import type { AdvanceTransition } from "./use-advance-controller";
import {
  resolveResumeDecision,
  useAdvanceController,
} from "./use-advance-controller";

interface Variables {
  sessionId: string;
  nodeId: string;
}
interface Context {
  previousAdvanceTransition: AdvanceTransition | null;
  previousSelectedChatId: string | null;
  transition: AdvanceTransition;
}
interface Options {
  onMutate: (variables: Variables) => Context;
  onSuccess: (
    result: RouterOutputs["training"]["advanceCompletedUnit"],
    variables: Variables,
    context: Context,
  ) => void;
  onError: (error: Error, variables: Variables, context: Context) => void;
}

const harness = vi.hoisted(() => ({
  transition: null as AdvanceTransition | null,
  effects: [] as (() => void | (() => void))[],
  options: null as Options | null,
  invalidateQueries: vi.fn(),
  mutate: vi.fn(),
  push: vi.fn(),
}));

vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useMemo: (callback: () => unknown) => callback(),
  useState: () => [
    harness.transition,
    (
      value:
        | AdvanceTransition
        | null
        | ((current: AdvanceTransition | null) => AdvanceTransition | null),
    ) => {
      harness.transition =
        typeof value === "function" ? value(harness.transition) : value;
    },
  ],
  useEffect: (effect: () => void | (() => void)) =>
    harness.effects.push(effect),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: harness.push }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: harness.invalidateQueries }),
  useMutation: (options: Options) => {
    harness.options = options;
    return { mutate: harness.mutate, isPending: false };
  },
}));
vi.mock("~/trpc/react", () => ({
  useTRPC: () => ({
    training: {
      aiWorkspace: { queryKey: (input: unknown) => ["workspace", input] },
      listLearningProjects: { queryKey: () => ["projects"] },
      workspaceShell: { queryKey: (input: unknown) => ["shell", input] },
      advanceCompletedUnit: { mutationOptions: (options: Options) => options },
    },
  }),
}));

const variables = { sessionId: "session", nodeId: "completed" };
function Harness(preparationError: string | null = null) {
  return useAdvanceController({
    selectedSessionId: variables.sessionId,
    selectedChatId: null,
    setSelectedChatId: vi.fn(),
    aiWorkspace: null,
    serverProjects: [],
    unitAdvanceGate: { status: "locked" },
    mode: "unit",
    isHistorySelected: false,
    isSessionRunning: false,
    preview: false,
    preparationError,
  });
}
function mutation() {
  if (!harness.options) throw new Error("Controller has not rendered");
  return harness.options;
}
function runEffects() {
  const cleanups = harness.effects.splice(0).map((effect) => effect());
  return () => cleanups.forEach((cleanup) => cleanup?.());
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  harness.transition = null;
  harness.effects = [];
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("next unit transition", () => {
  it("opens the projected chat before the request returns and refreshes a pending result immediately", () => {
    Harness();
    const context = mutation().onMutate(variables);
    expect(harness.transition).toMatchObject({
      completedNodeId: "completed",
      title: "Next unit",
      error: null,
    });
    mutation().onSuccess(
      { advanced: false, progressionPending: true },
      variables,
      context,
    );
    expect(harness.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["workspace", { sessionId: "session" }] },
      { cancelRefetch: false },
    );
    expect(harness.transition).toBe(context.transition);
  });

  it("checks readiness every second without aborting an in-flight refresh", () => {
    Harness();
    mutation().onMutate(variables);
    harness.effects = [];
    Harness();
    const cleanup = runEffects();
    vi.advanceTimersByTime(999);
    expect(harness.invalidateQueries).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(harness.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["workspace", { sessionId: "session" }] },
      { cancelRefetch: false },
    );
    cleanup();
    vi.advanceTimersByTime(5000);
    expect(harness.invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("keeps the same projected chat on failure and retries the completed unit", () => {
    Harness();
    const context = mutation().onMutate(variables);
    mutation().onError(new Error("Preparation failed"), variables, context);
    expect(harness.transition).toMatchObject({
      projectedNodeId: context.transition.projectedNodeId,
      error: "Preparation failed",
    });
    harness.effects = [];
    const controller = Harness();
    const cleanup = runEffects();
    vi.advanceTimersByTime(5000);
    expect(harness.invalidateQueries).not.toHaveBeenCalled();
    controller.retry();
    expect(harness.mutate).toHaveBeenCalledWith(variables);
    const retried = mutation().onMutate(variables);
    expect(retried.transition.projectedNodeId).toBe(
      context.transition.projectedNodeId,
    );
    expect(retried.transition.error).toBeNull();
    cleanup();
  });

  it("keeps an inline retry after the timeout instead of restoring the previous chat", () => {
    Harness();
    const context = mutation().onMutate(variables);
    harness.effects = [];
    Harness();
    const cleanup = runEffects();
    vi.advanceTimersByTime(120000);
    expect(harness.transition).toMatchObject({
      projectedNodeId: context.transition.projectedNodeId,
      error: "The next unit could not be prepared. Please try again.",
    });
    cleanup();
  });

  it("stops readiness polling when preparation reports failure", () => {
    Harness();
    mutation().onMutate(variables);
    harness.effects = [];
    Harness("Preparation failed");
    const cleanup = runEffects();
    vi.advanceTimersByTime(120000);
    expect(harness.invalidateQueries).not.toHaveBeenCalled();
    cleanup();
  });
});

describe("resolveResumeDecision", () => {
  const settled = {
    projectActive: true,
    isSessionRunning: false,
    advancePending: false,
    workspaceStatus: "success" as const,
    canAdvance: true,
    recallOfferStatus: "none" as const,
  };

  it("advances a finished unit once nothing else is due", () => {
    expect(resolveResumeDecision(settled)).toBe("advance");
  });

  it.each(["isSessionRunning", "advancePending"] as const)(
    "waits while %s blocks advancing and advances when it clears",
    (blocker) => {
      expect(resolveResumeDecision({ ...settled, [blocker]: true })).toBe(
        "wait",
      );
      expect(resolveResumeDecision(settled)).toBe("advance");
    },
  );

  it("stays in an unfinished chat", () => {
    expect(resolveResumeDecision({ ...settled, canAdvance: false })).toBe(
      "stay",
    );
  });

  it("stays on a waiting recall, which is the next step", () => {
    expect(
      resolveResumeDecision({ ...settled, recallOfferStatus: "ready" }),
    ).toBe("stay");
  });

  it("waits for the topic's workspace before deciding", () => {
    expect(
      resolveResumeDecision({ ...settled, workspaceStatus: "pending" }),
    ).toBe("wait");
  });

  it("waits for the recall offer before advancing past it", () => {
    expect(
      resolveResumeDecision({ ...settled, recallOfferStatus: "pending" }),
    ).toBe("wait");
  });

  it("never advances a project that is not active yet", () => {
    expect(resolveResumeDecision({ ...settled, projectActive: false })).toBe(
      "stay",
    );
  });

  it("stays when the workspace failed to load", () => {
    expect(
      resolveResumeDecision({
        ...settled,
        workspaceStatus: "error",
        canAdvance: false,
      }),
    ).toBe("stay");
  });
});
