import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type {
  OpeningLookup,
  OpeningPreparationDependencies,
  PreparedOpening,
} from "./prepare-opening";
import { UnitAgentTimeoutError } from "./agent-errors";
import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";
import { prepareOpening } from "./prepare-opening";

const input = {
  context: "Teach the meaning of the derivative as a local rate.",
  experience: DEFAULT_EDUCATION_EXPERIENCE,
  selectedResponse: false,
  testedCriterionIds: ["local-rate"],
};
const message =
  "The derivative measures local change. What does its sign tell you?";

function setup() {
  let current: OpeningLookup = { kind: "unopened", opening: null };
  let pending: Promise<PreparedOpening | null> | null = null;
  const teach = vi.fn<OpeningPreparationDependencies["teach"]>(() =>
    Effect.succeed({
      object: {
        assistantMessage: message,
        scratchpad: "",
        preparedScenario: null,
      },
    }),
  );
  const deps: OpeningPreparationDependencies = {
    load: () => Promise.resolve(current),
    teach,
    withLock: async (build, loadReady) => {
      if (pending) {
        await pending;
        return loadReady();
      }
      pending = build((opening) => {
        current = { kind: "unopened", opening };
        return Promise.resolve();
      });
      try {
        return await pending;
      } finally {
        pending = null;
      }
    },
  };
  return {
    deps,
    teach,
    started: () => {
      current = { kind: "started" };
    },
  };
}

describe("opening preparation", () => {
  it("reuses a prepared introduction without another model call", async () => {
    const { deps, teach } = setup();
    expect(await Effect.runPromise(prepareOpening(input, deps))).toBe(message);
    expect(await Effect.runPromise(prepareOpening(input, deps))).toBe(message);
    expect(teach).toHaveBeenCalledTimes(1);
  });

  it("joins background generation when the learner opens the unit", async () => {
    const { deps, teach } = setup();
    const outputs = await Promise.all([
      Effect.runPromise(prepareOpening(input, deps)),
      Effect.runPromise(prepareOpening(input, deps)),
    ]);
    expect(outputs).toEqual([message, message]);
    expect(teach).toHaveBeenCalledTimes(1);
  });

  it("rebuilds when teaching settings or content change", async () => {
    const { deps, teach } = setup();
    await Effect.runPromise(prepareOpening(input, deps));
    await Effect.runPromise(
      prepareOpening({ ...input, context: "Teach integration." }, deps),
    );
    await Effect.runPromise(
      prepareOpening(
        {
          ...input,
          experience: {
            ...input.experience,
            main: { instructions: "Use geometric examples." },
          },
        },
        deps,
      ),
    );
    expect(teach).toHaveBeenCalledTimes(3);
  });

  it("can retry a failed build without caching the failure", async () => {
    const { deps, teach } = setup();
    teach.mockImplementationOnce(() =>
      Effect.fail(new UnitAgentTimeoutError({ message: "Timed out" })),
    );
    await expect(
      Effect.runPromise(prepareOpening(input, deps)),
    ).rejects.toThrow("Your introduction could not be prepared");
    expect(await Effect.runPromise(prepareOpening(input, deps))).toBe(message);
    expect(teach).toHaveBeenCalledTimes(2);
  });

  it("does not generate a late introduction after the interaction changed", async () => {
    const { deps, teach, started } = setup();
    started();
    expect(await Effect.runPromise(prepareOpening(input, deps))).toBeNull();
    expect(teach).not.toHaveBeenCalled();
  });
});
