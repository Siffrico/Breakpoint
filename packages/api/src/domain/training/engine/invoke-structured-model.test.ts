import type * as Ai from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";

import {
  extractFirstJsonObject,
  invokeStructuredModel,
} from "./invoke-structured-model";

const streamText = vi.hoisted(() => vi.fn());

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof Ai>();
  return { ...actual, streamText };
});

beforeEach(() => {
  streamText.mockReset();
});

describe("extractFirstJsonObject", () => {
  it("leaves a single JSON object unchanged", () => {
    expect(extractFirstJsonObject('{"answer":"B"}')).toBe('{"answer":"B"}');
  });

  it("removes a prefix, code fence, and trailing text", () => {
    expect(
      extractFirstJsonObject(
        '```json\n{"answer":"B","reason":"supported"}\n```\nDone.',
      ),
    ).toBe('{"answer":"B","reason":"supported"}');
  });

  it("tracks nested objects and ignores braces inside strings", () => {
    const object = String.raw`{"scenario":{"text":"Use {evidence}, then \"decide}\".","key":{"answer":"B"}}}`;

    expect(extractFirstJsonObject(`Result:\n${object}\nextra`)).toBe(object);
  });

  it("keeps an incomplete root available to partial parsing", () => {
    expect(extractFirstJsonObject('```json\n{"answer":"B')).toBe(
      '{"answer":"B',
    );
  });

  it("leaves output without an object unchanged for error reporting", () => {
    expect(extractFirstJsonObject("not json")).toBe("not json");
  });
});

describe("tool-submitted structured output", () => {
  it("streams partial tool input and validates the one final submission", async () => {
    streamText.mockReturnValue({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          await Promise.resolve();
          yield {
            type: "tool-input-start",
            id: "call-1",
            toolName: "submit_structured_output",
          };
          yield {
            type: "tool-input-delta",
            id: "call-1",
            delta: '{"assistantMessage":"A complete',
          };
          yield {
            type: "tool-input-delta",
            id: "call-1",
            delta: ' scenario."}',
          };
        },
      },
      toolCalls: Promise.resolve([
        {
          toolName: "submit_structured_output",
          input: { assistantMessage: "A complete scenario." },
        },
      ]),
      totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 12 }),
    });

    const result = invokeStructuredModel({
      model: {} as never,
      schema: z.object({ assistantMessage: z.string().min(10) }),
      schemaName: "scenario",
      system: "System",
      prompt: "Prompt",
      maxSteps: 1,
      maxOutputTokens: 5_000,
      reasoning: "high",
      reasoningBudgetTokens: 2_400,
      temperature: 0.3,
      outputMode: "tool",
    });
    const partials = [];
    for await (const partial of result.partialOutputStream) {
      partials.push(partial);
    }

    await expect(result.output).resolves.toEqual({
      assistantMessage: "A complete scenario.",
    });
    expect(partials.at(-1)).toEqual({
      assistantMessage: "A complete scenario.",
    });
    expect(streamText).toHaveBeenCalledOnce();
    const settings = streamText.mock.calls[0]?.[0] as unknown;
    expect(settings).toMatchObject({
      maxRetries: 0,
      maxOutputTokens: 5_000,
      temperature: 0.3,
      toolChoice: {
        type: "tool",
        toolName: "submit_structured_output",
      },
      providerOptions: {
        openrouter: { reasoning: { enabled: true, max_tokens: 2_400 } },
      },
    });
    expect(settings).toHaveProperty(
      "tools.submit_structured_output.strict",
      true,
    );
    expect(settings).not.toHaveProperty("output");
  });
});
