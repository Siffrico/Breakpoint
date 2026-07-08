import type * as AiModule from "ai";
import { APICallError } from "ai";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";

vi.mock("../../engine/model-router", () => ({
  requireAiModelForPurpose: vi.fn(() => ({ modelId: "fake-model" })),
}));

const streamTextMock = vi.fn();

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof AiModule>();
  return {
    ...actual,
    streamText: (...args: unknown[]): unknown => streamTextMock(...args),
  };
});

const { runPhaseAgent } = await import("./run-phase-agent");

const schema = z.object({ assistantMessage: z.string() });

const partialOutputs = async function* (values: readonly unknown[]) {
  await Promise.resolve();
  yield* values;
};

const streamResult = (object: unknown, toolCalls: unknown[] = []) => ({
  output: Promise.resolve(object),
  toolCalls: Promise.resolve(toolCalls),
  partialOutputStream: partialOutputs([]),
});

const baseInput = {
  purpose: "education" as const,
  phase: "orient" as const,
  system: "system prompt",
  messages: [{ role: "user" as const, content: "hi" }],
  schema,
  schemaName: "test_output",
  errorMessage: "Phase agent failed.",
};

afterEach(() => {
  streamTextMock.mockReset();
});

describe("runPhaseAgent", () => {
  it("returns the object and tool calls on a clean first attempt", async () => {
    streamTextMock.mockReturnValueOnce(
      streamResult({ assistantMessage: "hello" }, [
        { toolName: "gradeConnection", input: { connected: true } },
      ]),
    );

    const result = await Effect.runPromise(runPhaseAgent(baseInput));

    expect(result.object).toEqual({ assistantMessage: "hello" });
    expect(result.toolCalls).toEqual([
      { toolName: "gradeConnection", input: { connected: true } },
    ]);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it("emits partial learner-facing messages before the structured result completes", async () => {
    const onPartialAssistantMessage = vi.fn();
    streamTextMock.mockReturnValueOnce({
      ...streamResult({ assistantMessage: "hello world" }),
      partialOutputStream: partialOutputs([
        { assistantMessage: "hello" },
        { assistantMessage: "hello world" },
      ]),
    });

    await Effect.runPromise(
      runPhaseAgent({ ...baseInput, onPartialAssistantMessage }),
    );

    expect(onPartialAssistantMessage.mock.calls).toEqual([
      ["hello"],
      ["hello world"],
    ]);
  });

  it("restarts on a timeout-classified failure and succeeds", async () => {
    const timeoutError = new Error("timed out");
    timeoutError.name = "TimeoutError";
    streamTextMock
      .mockImplementationOnce(() => {
        throw timeoutError;
      })
      .mockReturnValueOnce(streamResult({ assistantMessage: "recovered" }));

    const result = await Effect.runPromise(runPhaseAgent(baseInput));

    expect(result.object).toEqual({ assistantMessage: "recovered" });
    expect(streamTextMock).toHaveBeenCalledTimes(2);
  });

  it("restarts a transient provider failure", async () => {
    streamTextMock
      .mockImplementationOnce(() => {
        throw new APICallError({
          message: "rate limited",
          url: "https://provider.test/generate",
          requestBodyValues: {},
          statusCode: 429,
        });
      })
      .mockReturnValueOnce(streamResult({ assistantMessage: "recovered" }));

    const result = await Effect.runPromise(runPhaseAgent(baseInput));

    expect(result.object).toEqual({ assistantMessage: "recovered" });
    expect(streamTextMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a rejected provider request", async () => {
    streamTextMock.mockImplementationOnce(() => {
      throw new APICallError({
        message: "invalid API key",
        url: "https://provider.test/generate",
        requestBodyValues: {},
        statusCode: 401,
      });
    });

    const exit = await Effect.runPromiseExit(runPhaseAgent(baseInput));

    expect(exit._tag).toBe("Failure");
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it("aborts the provider call when the Effect is interrupted", async () => {
    let providerSignal: AbortSignal | undefined;
    let providerAborted = false;
    streamTextMock.mockImplementationOnce(
      ({ abortSignal }: { abortSignal: AbortSignal }) => {
        providerSignal = abortSignal;
        const interrupted = new Promise<never>((_resolve, reject) => {
          abortSignal.addEventListener(
            "abort",
            () => {
              providerAborted = true;
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            },
            { once: true },
          );
        });
        return { output: interrupted, toolCalls: interrupted };
      },
    );
    const controller = new AbortController();

    const running = Effect.runPromise(runPhaseAgent(baseInput), {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(providerSignal).toBeDefined());
    controller.abort();

    await expect(running).rejects.toBeDefined();
    expect(providerAborted).toBe(true);
    expect(providerSignal?.aborted).toBe(true);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it("repairs once on a schema failure by appending a corrective message", async () => {
    const schemaError = new Error("bad shape");
    schemaError.name = "TypeValidationError";
    streamTextMock
      .mockImplementationOnce(() => {
        throw schemaError;
      })
      .mockReturnValueOnce(streamResult({ assistantMessage: "fixed" }));

    const result = await Effect.runPromise(runPhaseAgent(baseInput));

    expect(result.object).toEqual({ assistantMessage: "fixed" });
    expect(streamTextMock).toHaveBeenCalledTimes(2);
    const secondCallArgs = streamTextMock.mock.calls[1]?.[0] as {
      prompt: { role: string; content: string }[];
    };
    expect(secondCallArgs.prompt).toHaveLength(2);
    expect(secondCallArgs.prompt[1]?.role).toBe("user");
  });

  it("fails with the tagged error once the schema repair budget is exhausted", async () => {
    const schemaError = new Error("still bad");
    schemaError.name = "TypeValidationError";
    streamTextMock.mockImplementation(() => {
      throw schemaError;
    });

    const exit = await Effect.runPromiseExit(runPhaseAgent(baseInput));

    expect(exit._tag).toBe("Failure");
    // 1 initial attempt + 1 repair = 2 calls total before giving up.
    expect(streamTextMock).toHaveBeenCalledTimes(2);
  });
});
