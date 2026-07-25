import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

// A drop-in ChatTransport that replaces the production HTTP transport with a
// local, timer-driven emitter. `useChat` calls sendMessages() and consumes the
// returned ReadableStream<UIMessageChunk> exactly as it would a real network
// stream — so the renderer, throttling, and partial-fence behavior are the real
// production code path. The ONLY thing faked is where the chunks come from:
// a fixture string instead of an LLM.
//
// NOTE vs. production: real Breakpoint routes stream via smoothStream on the
// server. This mock reproduces smoothStream's default word-level chunking
// (splitting on whitespace) client-side so the reveal cadence matches, but it
// emits plain text-delta parts rather than the structured output the live
// workspace route uses. That's deliberate — this bench tests text rendering.

export type ChunkMode = "char" | "word" | "token";

export interface MockTransportOptions {
  /** The full assistant message to reveal. */
  text: string;
  /** Optional reasoning trace streamed as reasoning-* parts before the text. */
  reasoningText?: string;
  /** Reveal granularity. "word" mirrors smoothStream's default. */
  chunkMode: ChunkMode;
  /** Delay between emitted chunks, in ms. */
  delayMs: number;
}

// Split the target text into the units we emit one-at-a-time. Whitespace is
// kept attached to the preceding token so the reassembled string is identical
// to the source (no lost spaces/newlines).
function splitIntoChunks(text: string, mode: ChunkMode): string[] {
  if (mode === "char") return Array.from(text);
  if (mode === "word") return text.match(/\S+\s*/g) ?? [text];
  // "token" — a coarse approximation of subword tokens: ~4-char slices, which
  // reveals mid-word and feels closest to a real LLM stream.
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 4) chunks.push(text.slice(i, i + 4));
  return chunks;
}

export class MockChatTransport<UI_MESSAGE extends UIMessage>
  implements ChatTransport<UI_MESSAGE>
{
  constructor(private options: MockTransportOptions) {}

  setOptions(options: MockTransportOptions) {
    this.options = options;
  }

  sendMessages({
    abortSignal,
  }: Parameters<ChatTransport<UI_MESSAGE>["sendMessages"]>[0]): Promise<
    ReadableStream<UIMessageChunk>
  > {
    const { text, reasoningText, chunkMode, delayMs } = this.options;
    const parts = splitIntoChunks(text, chunkMode);
    // Reasoning streams faster than answer text (real providers emit thinking
    // tokens in bursts), so halve the delay for the reasoning phase.
    const reasoningParts = reasoningText
      ? splitIntoChunks(reasoningText, chunkMode)
      : [];
    const id = `mock-${Date.now()}`;
    const reasoningId = `${id}-reasoning`;

    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        let index = 0;
        let reasoningIndex = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const cleanup = () => {
          if (timer) clearTimeout(timer);
        };

        // If the caller aborts (Stop button), close the stream where it stands —
        // just like a cancelled fetch.
        abortSignal?.addEventListener("abort", () => {
          cleanup();
          try {
            controller.close();
          } catch {
            // already closed
          }
        });

        controller.enqueue({ type: "start" } as UIMessageChunk);

        const pumpText = () => {
          if (abortSignal?.aborted) return;
          if (index >= parts.length) {
            controller.enqueue({ type: "text-end", id });
            controller.enqueue({ type: "finish" } as UIMessageChunk);
            controller.close();
            return;
          }
          controller.enqueue({
            type: "text-delta",
            id,
            delta: parts[index] ?? "",
          });
          index += 1;
          timer = setTimeout(pumpText, delayMs);
        };

        const startText = () => {
          controller.enqueue({ type: "text-start", id });
          pumpText();
        };

        const pumpReasoning = () => {
          if (abortSignal?.aborted) return;
          if (reasoningIndex >= reasoningParts.length) {
            controller.enqueue({ type: "reasoning-end", id: reasoningId });
            timer = setTimeout(startText, Math.max(delayMs * 4, 120));
            return;
          }
          controller.enqueue({
            type: "reasoning-delta",
            id: reasoningId,
            delta: reasoningParts[reasoningIndex] ?? "",
          });
          reasoningIndex += 1;
          timer = setTimeout(pumpReasoning, Math.max(delayMs / 2, 4));
        };

        if (reasoningParts.length > 0) {
          controller.enqueue({ type: "reasoning-start", id: reasoningId });
          pumpReasoning();
        } else {
          startText();
        }
      },
    });

    return Promise.resolve(stream);
  }

  // No server-side stream to resume in the mock.
  reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return Promise.resolve(null);
  }
}
