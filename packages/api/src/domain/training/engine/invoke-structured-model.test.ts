import type * as Ai from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";

import {
  extractFirstJsonObject,
  invokeStructuredModel,
} from "./invoke-structured-model";

const streamText = vi.hoisted(() =>
  vi.fn((options: unknown) => ({ options, result: true })),
);

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof Ai>();
  return { ...actual, streamText };
});

beforeEach(() => {
  streamText.mockClear();
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

describe("invokeStructuredModel", () => {
  it("routes OpenRouter structured output only through compatible low-latency endpoints", () => {
    const model = { specificationVersion: "v3" } as never;

    invokeStructuredModel({
      model,
      schema: z.object({ answer: z.string() }),
      schemaName: "test_schema",
      system: "System",
      prompt: "Prompt",
      maxSteps: 1,
      reasoning: "none",
    });

    expect(streamText).toHaveBeenCalledOnce();
    expect(streamText.mock.calls[0]?.[0]).toMatchObject({
      providerOptions: {
        openrouter: {
          provider: {
            require_parameters: true,
            sort: "latency",
          },
          reasoning: { enabled: false, effort: "none" },
        },
      },
    });
  });
});
