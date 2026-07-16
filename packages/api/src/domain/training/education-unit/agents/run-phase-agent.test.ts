import type * as AiModule from "ai";
import type { ModelMessage } from "ai";
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
  usage: Promise.resolve({
    inputTokens: 120,
    cachedInputTokens: 80,
  }),
  partialOutputStream: partialOutputs([]),
});

const baseInput = {
  purpose: "education" as const,
  phase: "orient" as const,
  system: "system prompt",
  messages: [{ role: "user" as const, content: "hi" }],
  instruction: "Follow the phase instruction.",
  contextBlock: "## Context\nTest context",
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

  it("appends the turn directive after the untouched transcript", async () => {
    streamTextMock.mockReturnValueOnce(
      streamResult({ assistantMessage: "hello" }),
    );

    await Effect.runPromise(runPhaseAgent(baseInput));

    const call = streamTextMock.mock.calls[0]?.[0] as {
      system?: string;
      prompt: ModelMessage[];
    };
    expect(call.system).toBeUndefined();
    expect(call.prompt.map(({ role, content }) => ({ role, content }))).toEqual(
      [
        { role: "system", content: "system prompt" },
        { role: "user", content: "hi" },
        {
          role: "user",
          content:
            "## This turn\n\nFollow the phase instruction.\n\n## Unit context\n\n## Context\nTest context",
        },
      ],
    );
    expect(baseInput.messages).toEqual([{ role: "user", content: "hi" }]);
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

  it("repairs once by appending a corrective message after the directive", async () => {
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
    expect(secondCallArgs.prompt).toHaveLength(4);
    expect(secondCallArgs.prompt[2]?.content).toContain("## This turn");
    expect(secondCallArgs.prompt[3]?.content).toContain(
      "Your previous response did not match",
    );
  });

  it("keeps every shared prompt-prefix message deeply equal across turns", async () => {
    streamTextMock
      .mockReturnValueOnce(streamResult({ assistantMessage: "turn n" }))
      .mockReturnValueOnce(
        streamResult({ assistantMessage: "turn n plus one" }),
      );

    await Effect.runPromise(
      runPhaseAgent({ ...baseInput, contextBlock: "context for turn N" }),
    );
    await Effect.runPromise(
      runPhaseAgent({ ...baseInput, contextBlock: "context for turn N+1" }),
    );

    const firstPrompt = (
      streamTextMock.mock.calls[0]?.[0] as { prompt: ModelMessage[] }
    ).prompt;
    const secondPrompt = (
      streamTextMock.mock.calls[1]?.[0] as { prompt: ModelMessage[] }
    ).prompt;
    expect(firstPrompt).toHaveLength(secondPrompt.length);
    for (let index = 0; index < firstPrompt.length - 1; index += 1) {
      expect(secondPrompt[index]).toEqual(firstPrompt[index]);
    }
    expect(secondPrompt.at(-1)).not.toEqual(firstPrompt.at(-1));
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
