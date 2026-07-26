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

const schema = z.object({ assistantMessage: z.string().min(1) });

const partialOutputs = async function* (values: readonly unknown[]) {
  await Promise.resolve();
  yield* values;
};

const streamResult = (object: unknown, partials: readonly unknown[] = []) => ({
  output: Promise.resolve(object),
  partialOutputStream: partialOutputs(partials),
  totalUsage: Promise.resolve({
    inputTokens: 120,
    cachedInputTokens: 80,
  }),
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
  vi.useRealTimers();
  streamTextMock.mockReset();
});

describe("runPhaseAgent", () => {
  it("returns one validated structured result", async () => {
    streamTextMock.mockReturnValueOnce(
      streamResult({ assistantMessage: "hello" }),
    );

    const result = await Effect.runPromise(runPhaseAgent(baseInput));

    expect(result.object).toEqual({ assistantMessage: "hello" });
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const call = streamTextMock.mock.calls[0]?.[0] as unknown as {
      tools?: unknown;
      stopWhen?: unknown;
      maxOutputTokens?: number;
      prepareStep?: unknown;
    };
    expect(call.tools).toBeUndefined();
    expect(typeof call.stopWhen).toBe("function");
    expect(call.maxOutputTokens).toBe(1_000);
    expect(call.prepareStep).toBeUndefined();
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

  it("streams only cumulative assistantMessage snapshots", async () => {
    const onPartialAssistantMessage = vi.fn();
    const privateSchema = z.object({
      assistantMessage: z.string(),
      event: z.object({ score: z.number(), reasoning: z.string() }),
      scenarioSpec: z.object({ canonicalAnswer: z.string() }),
    });
    const object = {
      assistantMessage: "hello world",
      event: { score: 86, reasoning: "private grade" },
      scenarioSpec: { canonicalAnswer: "private answer" },
    };
    streamTextMock.mockReturnValueOnce(
      streamResult(object, [
        { assistantMessage: "hello" },
        {
          assistantMessage: "hello world",
          event: { score: 86, reasoning: "private grade" },
        },
        object,
      ]),
    );

    await Effect.runPromise(
      runPhaseAgent({
        ...baseInput,
        schema: privateSchema,
        onPartialAssistantMessage,
      }),
    );

    expect(onPartialAssistantMessage.mock.calls).toEqual([
      ["hello"],
      ["hello world"],
      ["hello world"],
    ]);
    expect(JSON.stringify(onPartialAssistantMessage.mock.calls)).not.toContain(
      "private",
    );
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

  it("keeps an active structured stream alive beyond the timeout", async () => {
    vi.useFakeTimers();
    streamTextMock.mockImplementationOnce(
      ({ abortSignal }: { abortSignal: AbortSignal }) => ({
          ...streamResult({ assistantMessage: "completed after a long stream" }),
          partialOutputStream: (async function* () {
            for (const content of [
              "completed learner-facing response",
              "completed learner-facing response after ",
              "completed learner-facing response after a ",
              "completed after a long stream",
            ]) {
            await new Promise((resolve) => setTimeout(resolve, 4_000));
            if (abortSignal.aborted) throw abortSignal.reason;
            yield { assistantMessage: content };
          }
        })(),
      }),
    );

    const running = Effect.runPromise(runPhaseAgent(baseInput));
    await vi.advanceTimersByTimeAsync(16_000);

    await expect(running).resolves.toMatchObject({
      object: { assistantMessage: "completed after a long stream" },
    });
  });

  it("fails without retrying when substantive visible text misses five seconds", async () => {
    vi.useFakeTimers();
    streamTextMock.mockImplementationOnce(
      ({ abortSignal }: { abortSignal: AbortSignal }) => ({
        ...streamResult({ assistantMessage: "never completed" }),
        partialOutputStream: (async function* () {
          yield { assistantMessage: "I" };
          yield await new Promise<never>((_resolve, reject) => {
            abortSignal.addEventListener(
              "abort",
              () =>
                reject(
                  abortSignal.reason instanceof Error
                    ? abortSignal.reason
                    : new Error("Provider stream aborted."),
                ),
              { once: true },
            );
          });
        })(),
      }),
    );

    const running = Effect.runPromise(runPhaseAgent(baseInput));
    const outcome = expect(running).rejects.toMatchObject({
      _tag: "AgentFirstVisibleTimeoutError",
    });
    await vi.advanceTimersByTimeAsync(5_100);

    await outcome;
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it("restarts a structured stream with no activity", async () => {
    vi.useFakeTimers();
    streamTextMock
      .mockImplementationOnce(
        ({ abortSignal }: { abortSignal: AbortSignal }) => ({
          ...streamResult({ assistantMessage: "never" }),
          partialOutputStream: (async function* () {
            yield {
              assistantMessage:
                "A substantive speculative response began successfully.",
            };
            yield await new Promise<never>((_resolve, reject) => {
              abortSignal.addEventListener(
                "abort",
                () => {
                  const error = new Error("provider stream timed out");
                  error.name = "TimeoutError";
                  reject(error);
                },
                { once: true },
              );
            });
          })(),
        }),
      )
      .mockReturnValueOnce(streamResult({ assistantMessage: "recovered" }));

    const running = Effect.runPromise(runPhaseAgent(baseInput));
    const outcome = expect(running).resolves.toMatchObject({
      object: { assistantMessage: "recovered" },
    });
    await vi.advanceTimersByTimeAsync(10_500);

    await outcome;
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

    await expect(
      Effect.runPromise(runPhaseAgent(baseInput)),
    ).resolves.toMatchObject({ object: { assistantMessage: "recovered" } });
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

  it("aborts the provider stream when the Effect is interrupted", async () => {
    let providerSignal: AbortSignal | undefined;
    streamTextMock.mockImplementationOnce(
      ({ abortSignal }: { abortSignal: AbortSignal }) => {
        providerSignal = abortSignal;
        return {
          ...streamResult({ assistantMessage: "never" }),
          partialOutputStream: (async function* () {
            yield await new Promise<never>((_resolve, reject) => {
              abortSignal.addEventListener(
                "abort",
                () => reject(new Error("provider stream aborted")),
                { once: true },
              );
            });
          })(),
        };
      },
    );
    const controller = new AbortController();

    const running = Effect.runPromise(runPhaseAgent(baseInput), {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(providerSignal).toBeDefined());
    controller.abort();

    await expect(running).rejects.toBeDefined();
    expect(providerSignal?.aborted).toBe(true);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it("repairs a schema failure once with a corrective message", async () => {
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
    const secondCall = streamTextMock.mock.calls[1]?.[0] as {
      prompt: { role: string; content: string }[];
    };
    expect(secondCall.prompt).toHaveLength(4);
    expect(secondCall.prompt[3]?.content).toContain(
      "did not match the required output contract",
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
    for (let index = 0; index < firstPrompt.length - 1; index += 1) {
      expect(secondPrompt[index]).toEqual(firstPrompt[index]);
    }
    expect(secondPrompt.at(-1)).not.toEqual(firstPrompt.at(-1));
  });

  it("fails after exhausting the schema repair budget", async () => {
    const schemaError = new Error("still bad");
    schemaError.name = "TypeValidationError";
    streamTextMock.mockImplementation(() => {
      throw schemaError;
    });

    const exit = await Effect.runPromiseExit(runPhaseAgent(baseInput));

    expect(exit._tag).toBe("Failure");
    expect(streamTextMock).toHaveBeenCalledTimes(2);
  });
});
