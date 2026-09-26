import type { ReactNode } from "react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as AdvanceModule from "./use-advance-controller";
import type * as NavigationModule from "./use-workspace-navigation";
import type { WorkspaceNavigation } from "./use-workspace-navigation";
import { WorkspaceShell } from "./workspace-shell";

const harness = vi.hoisted(() => ({
  slots: [] as { value: unknown }[],
  cursor: 0,
  effects: [] as (() => void | (() => void))[],
  nav: null as WorkspaceNavigation | null,
  pending: false,
  advance: vi.fn(),
  listeners: new Map<string, () => void>(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    const slot = (harness.slots[index] ??= { value: initial });
    return [
      slot.value,
      (next: unknown) => {
        slot.value =
          typeof next === "function"
            ? Reflect.apply(next, undefined, [slot.value])
            : next;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    const slot = (harness.slots[index] ??= { value: { current: initial } });
    return slot.value;
  },
  useCallback: (callback: unknown) => callback,
  useMemo: (callback: () => unknown) => callback(),
  useEffect: (effect: () => void | (() => void)) =>
    harness.effects.push(effect),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
}));
vi.mock("~/trpc/react", () => ({ useTRPC: () => ({}) }));
vi.mock("~/hooks/use-local-storage", () => ({
  useLocalStorage: () => ["warm", vi.fn()],
}));
vi.mock("./use-workspace-navigation", async (importOriginal) => {
  const original = await importOriginal<typeof NavigationModule>();
  return {
    ...original,
    useWorkspaceNavigation: (
      ...args: Parameters<typeof original.useWorkspaceNavigation>
    ) => {
      harness.nav = original.useWorkspaceNavigation(...args);
      return harness.nav;
    },
  };
});
vi.mock("./use-workspace-session", () => ({
  useWorkspaceSession: () => ({
    selectedProject: { status: "active" },
    aiWorkspaceStatus: "success",
    recallOfferStatus: "none",
    unitAdvanceGate: { status: "enabled", unitId: "completed" },
    mode: "unit",
    chatHistoryQuery: { isError: false },
  }),
}));
vi.mock("./use-advance-controller", async (importOriginal) => {
  const original = await importOriginal<typeof AdvanceModule>();
  return {
    ...original,
    useAdvanceController: ({
      isSessionRunning,
    }: {
      isSessionRunning: boolean;
    }) => {
      return {
        canAdvance: true,
        isPending: harness.pending,
        advance: () => {
          if (!isSessionRunning && !harness.pending) harness.advance();
        },
      };
    },
  };
});
vi.mock("./use-unit-coach-controller", () => ({
  useUnitCoachController: () => ({}),
}));
vi.mock("./workspace-sidebar", () => ({ WorkspaceSidebar: () => null }));
vi.mock("./workspace-header", () => ({ WorkspaceHeader: () => null }));
vi.mock("./workspace-live-workspace", () => ({
  WorkspaceLiveWorkspace: () => null,
}));

function render() {
  harness.cursor = 0;
  harness.effects = [];
  const tree = WorkspaceShell({
    plan: null,
    onboardingState: null,
    sessionId: "A",
  });
  for (const effect of harness.effects) effect();
  return tree;
}
function navigation() {
  if (!harness.nav) throw new Error("Workspace has not rendered");
  return harness.nav;
}

beforeEach(() => {
  harness.slots = [];
  harness.pending = false;
  harness.listeners.clear();
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", {
    location: { search: "?session=A" },
    history: { pushState: vi.fn(), replaceState: vi.fn() },
    addEventListener: (name: string, callback: () => void) =>
      harness.listeners.set(name, callback),
    removeEventListener: vi.fn(),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: vi.fn(),
  });
  vi.stubGlobal("document", { cookie: "" });
});
afterEach(() => vi.unstubAllGlobals());

function runningChanged(tree: ReactNode, running: boolean) {
  React.Children.forEach(tree, (child) => {
    if (
      !React.isValidElement<{
        children?: ReactNode;
        onRunningChange?: (running: boolean) => void;
      }>(child)
    )
      return;
    child.props.onRunningChange?.(running);
    runningChanged(child.props.children, running);
  });
}

describe("workspace resume navigation", () => {
  it("waits for a running chat and resumes exactly once when it stops", () => {
    runningChanged(render(), true);
    render();
    navigation().navigate("B", null, { resume: true });
    const tree = render();
    expect(harness.advance).not.toHaveBeenCalled();
    runningChanged(tree, false);
    render();
    render();
    expect(harness.advance).toHaveBeenCalledTimes(1);
  });

  it.each(["back", "ordinary navigation"])(
    "advances once after %s clears an earlier request",
    (cancel) => {
      render();
      navigation().navigate("A", null, { resume: true });
      render();
      expect(harness.advance).toHaveBeenCalledTimes(1);
      if (cancel === "back") harness.listeners.get("popstate")?.();
      else navigation().navigate("A", null);
      render();
      expect(navigation().resumeRequest).toBeNull();
      navigation().navigate("B", null, { resume: true });
      render();
      render();
      expect(navigation().resumeRequest).toEqual({ sessionId: "B", id: 2 });
      expect(harness.advance).toHaveBeenCalledTimes(2);
    },
  );

  it("waits for an in-flight advance and resumes exactly once", () => {
    harness.pending = true;
    render();
    navigation().navigate("B", null, { resume: true });
    render();
    expect(harness.advance).not.toHaveBeenCalled();
    harness.pending = false;
    render();
    render();
    expect(harness.advance).toHaveBeenCalledTimes(1);
  });

  it("cancels a blocked resume when the learner navigates away", () => {
    harness.pending = true;
    render();
    navigation().navigate("B", null, { resume: true });
    render();
    harness.listeners.get("popstate")?.();
    render();
    harness.pending = false;
    render();
    expect(navigation().resumeRequest).toBeNull();
    expect(harness.advance).not.toHaveBeenCalled();
  });
});
