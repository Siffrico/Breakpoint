import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { UnitContent } from "../types/training.types";
import type { UnitPreparationDependencies } from "./prepare-unit-content";
import {
  makeDeps,
  node,
  planNode,
  unit,
  unitContext,
} from "./preparation.fixture";
import { prepareUnitContent } from "./prepare-unit-content";

describe("prepareUnitContent", () => {
  it("persists only the assignment and real metadata", async () => {
    const deps = makeDeps();
    await Effect.runPromise(
      prepareUnitContent({ node, sessionId: "session-1", deps }),
    );
    expect(deps.createUnitContentIfAbsent).toHaveBeenCalledWith({
      nodeId: node.id,
      title: planNode.title,
      clusterArcFrame: planNode.summary,
      scenario: { title: planNode.title, focusAreas: ["Causal probe"] },
      unitContext,
    });
  });
  it.each(["getPlanNodesBySession", "getUnitKnowledgeContext"] as const)(
    "tags a rejected %s read as a storage failure",
    async (method) => {
      const deps = makeDeps({
        [method]: vi.fn().mockRejectedValue(new Error("database unavailable")),
      });
      const exit = await Effect.runPromiseExit(
        prepareUnitContent({ node, sessionId: "session-1", deps }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(String(exit.cause)).toContain("UnitPersistError");
      expect(deps.createUnitContentIfAbsent).not.toHaveBeenCalled();
    },
  );
  it("locks before re-checking and short-circuits an existing row", async () => {
    const lockedDeps = makeDeps({
      getUnitByNodeId: vi.fn(() => Promise.resolve(unit)),
    });
    const lockedNodeIds: string[] = [];
    const withUnitBuildLock: UnitPreparationDependencies["withUnitBuildLock"] =
      (nodeId, build) => {
        lockedNodeIds.push(nodeId);
        return build(lockedDeps);
      };
    const deps = { ...lockedDeps, withUnitBuildLock };

    const result = await Effect.runPromise(
      prepareUnitContent({ node, sessionId: "session-1", deps }),
    );

    expect(result).toBe(unit);
    expect(lockedNodeIds).toEqual([node.id]);
    expect(deps.getPlanNodesBySession).not.toHaveBeenCalled();
    expect(deps.createUnitContentIfAbsent).not.toHaveBeenCalled();
    expect(deps.replaceUnitContent).not.toHaveBeenCalled();
  });

  it("singleflights assignment and briefing work across concurrent prepares", async () => {
    let storedUnit: UnitContent | null = null;
    let lockTail = Promise.resolve();
    const createUnitContentIfAbsent = vi.fn(() => {
      storedUnit = unit;
      return Promise.resolve(unit);
    });
    const lockedDeps = makeDeps({
      getUnitByNodeId: vi.fn(() => Promise.resolve(storedUnit)),
      createUnitContentIfAbsent,
      withUnitBuildLock: async (_nodeId, build) => {
        const previous = lockTail;
        let release!: () => void;
        lockTail = new Promise<void>((resolveLock) => {
          release = resolveLock;
        });
        await previous;
        try {
          return await build(lockedDeps);
        } finally {
          release();
        }
      },
    });
    const prepareClusterBriefing = vi.fn(() =>
      Promise.resolve({
        nodeId: "cluster-1",
        briefing: {
          briefingArc: "A diagnostic sequence.",
          briefingMap: [{ position: 1, role: "Isolate the causal signal." }],
        },
      }),
    );
    const input = {
      node,
      sessionId: "session-1",
      deps: lockedDeps,
      prepareClusterBriefing,
    };

    await Promise.all([
      Effect.runPromise(prepareUnitContent(input)),
      Effect.runPromise(prepareUnitContent(input)),
    ]);

    expect(prepareClusterBriefing).toHaveBeenCalledTimes(1);
    expect(lockedDeps.saveNodeBriefing).toHaveBeenCalledTimes(1);
    expect(createUnitContentIfAbsent).toHaveBeenCalledTimes(1);
  });

  it("does not fail prepared content when optional briefing persistence fails", async () => {
    const deps = makeDeps({
      saveNodeBriefing: vi.fn(() =>
        Promise.reject(new Error("briefing write")),
      ),
    });

    const result = await Effect.runPromise(
      prepareUnitContent({
        node,
        sessionId: "session-1",
        deps,
        prepareClusterBriefing: () =>
          Promise.resolve({
            nodeId: "cluster-1",
            briefing: {
              briefingArc: "A diagnostic sequence.",
              briefingMap: [
                { position: 1, role: "Isolate the causal signal." },
              ],
            },
          }),
      }),
    );

    expect(result).toBe(unit);
  });

  it("uses replacement for an explicit refresh", async () => {
    const deps = makeDeps({
      getUnitByNodeId: vi.fn(() => Promise.resolve(unit)),
    });

    const result = await Effect.runPromise(
      prepareUnitContent({
        node,
        sessionId: "session-1",
        deps,
        forceRefresh: true,
      }),
    );

    expect(result).toBe(unit);
    expect(deps.replaceUnitContent).toHaveBeenCalledTimes(1);
    expect(deps.createUnitContentIfAbsent).not.toHaveBeenCalled();
  });

  it("repairs prepared content that is missing its capability contract", async () => {
    const deps = makeDeps({
      getUnitByNodeId: vi.fn(() =>
        Promise.resolve({ ...unit, unitContext: null }),
      ),
    });

    await Effect.runPromise(
      prepareUnitContent({ node, sessionId: "session-1", deps }),
    );

    expect(deps.replaceUnitContent).toHaveBeenCalledWith(
      expect.objectContaining({
        unitContext,
      }),
    );
    expect(deps.createUnitContentIfAbsent).not.toHaveBeenCalled();
  });

  it("does not persist when required context is missing", async () => {
    const deps = makeDeps({
      getUnitKnowledgeContext: vi.fn(() => Promise.resolve(null)),
    });

    const exit = await Effect.runPromiseExit(
      prepareUnitContent({ node, sessionId: "session-1", deps }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("UnitContextMissingError");
    }
  });

  it("tags a write failure as UnitPersistError without regenerating", async () => {
    const deps = makeDeps({
      createUnitContentIfAbsent: vi.fn(() =>
        Promise.reject(new Error("db down")),
      ),
    });

    const exit = await Effect.runPromiseExit(
      prepareUnitContent({ node, sessionId: "session-1", deps }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("UnitPersistError");
    }
    expect(deps.createUnitContentIfAbsent).toHaveBeenCalledTimes(1);
  });
});
