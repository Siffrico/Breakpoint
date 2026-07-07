import { describe, expect, it } from "vitest";

import type { AssistantTextStreamWriter } from "./assistant-text-streamer";
import { createAssistantTextStreamer } from "./assistant-text-streamer";

const makeWriter = () => {
  const chunks: unknown[] = [];
  const writer: AssistantTextStreamWriter = {
    write: (chunk) => {
      chunks.push(chunk);
    },
  };
  return { writer, chunks };
};

describe("createAssistantTextStreamer", () => {
  it("streams extending snapshots as deltas and closes on finalize", () => {
    const { writer, chunks } = makeWriter();
    const streamer = createAssistantTextStreamer({ writer, partId: "part" });

    streamer.pushPartial("hello");
    streamer.pushPartial("hello world");
    streamer.finalize("hello world!");

    expect(chunks).toEqual([
      { type: "text-start", id: "part" },
      { type: "text-delta", id: "part", delta: "hello" },
      { type: "text-delta", id: "part", delta: " world" },
      { type: "text-delta", id: "part", delta: "!" },
      { type: "text-end", id: "part" },
    ]);
  });

  it("ignores snapshots that do not extend the streamed text", () => {
    const { writer, chunks } = makeWriter();
    const streamer = createAssistantTextStreamer({ writer, partId: "part" });

    streamer.pushPartial("hello world");
    streamer.pushPartial("hello");
    streamer.pushPartial("something else entirely");

    expect(chunks).toEqual([
      { type: "text-start", id: "part" },
      { type: "text-delta", id: "part", delta: "hello world" },
    ]);
  });

  it("emits the authoritative final text when the commit diverges from streamed partials", () => {
    const { writer, chunks } = makeWriter();
    const streamer = createAssistantTextStreamer({ writer, partId: "part" });

    streamer.pushPartial("The key idea here is");
    streamer.finalize("Let's look at this differently.");

    expect(chunks).toEqual([
      { type: "text-start", id: "part" },
      { type: "text-delta", id: "part", delta: "The key idea here is" },
      { type: "text-end", id: "part" },
      {
        type: "data-workspace-final-text",
        id: "part-final",
        data: { text: "Let's look at this differently." },
      },
    ]);
  });

  it("writes the full reply when finalize arrives with no streamed partials", () => {
    const { writer, chunks } = makeWriter();
    const streamer = createAssistantTextStreamer({ writer, partId: "part" });

    streamer.finalize("cached reply");

    expect(chunks).toEqual([
      { type: "text-start", id: "part" },
      { type: "text-delta", id: "part", delta: "cached reply" },
      { type: "text-end", id: "part" },
    ]);
  });

  it("drops late partials from a dead attempt after finalize", () => {
    const { writer, chunks } = makeWriter();
    const streamer = createAssistantTextStreamer({ writer, partId: "part" });

    streamer.pushPartial("hello");
    streamer.finalize("hello world");
    streamer.pushPartial("hello world and more");
    streamer.close();

    expect(chunks).toEqual([
      { type: "text-start", id: "part" },
      { type: "text-delta", id: "part", delta: "hello" },
      { type: "text-delta", id: "part", delta: " world" },
      { type: "text-end", id: "part" },
    ]);
  });

  it("close is a no-op when nothing was streamed", () => {
    const { writer, chunks } = makeWriter();
    const streamer = createAssistantTextStreamer({ writer, partId: "part" });

    streamer.close();

    expect(chunks).toEqual([]);
  });
});
