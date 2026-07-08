// Streams the education agents' learner-facing reply into a UI message stream.
//
// Partials are speculative: they come straight from the model's partial
// structured output and may belong to an attempt that later restarts or gets
// a schema repair. Only finalize() carries committed truth — the assistant
// message that survived the transactional turn commit. Streamed text cannot
// be retracted from a UI message stream, so when the final text does not
// extend what was already streamed, the streamer closes the text part and
// emits a data-workspace-final-text part that the client renders instead.

type AssistantTextChunk =
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | {
      type: "data-workspace-final-text";
      id: string;
      data: { text: string };
    };

export interface AssistantTextStreamWriter {
  write: (chunk: AssistantTextChunk) => void;
}

export interface AssistantTextStreamer {
  /** Speculative cumulative snapshot; ignored unless it extends prior text. */
  pushPartial: (content: string) => void;
  /** The committed reply. Always reaches the client, even on divergence. */
  finalize: (content: string) => void;
  /** Safety net: closes a dangling text part if finalize never ran. */
  close: () => void;
}

export const createAssistantTextStreamer = ({
  writer,
  partId,
}: {
  writer: AssistantTextStreamWriter;
  partId: string;
}): AssistantTextStreamer => {
  let streamed = "";
  let started = false;
  let done = false;

  const writeDelta = (delta: string) => {
    if (!started) {
      writer.write({ type: "text-start", id: partId });
      started = true;
    }
    writer.write({ type: "text-delta", id: partId, delta });
  };
  const endTextPart = () => {
    if (!started) return;
    writer.write({ type: "text-end", id: partId });
  };

  return {
    pushPartial: (content) => {
      if (done) return;
      if (content.length <= streamed.length || !content.startsWith(streamed)) {
        return;
      }
      const delta = content.slice(streamed.length);
      streamed = content;
      writeDelta(delta);
    },
    finalize: (content) => {
      if (done) return;
      done = true;
      if (content.startsWith(streamed)) {
        const delta = content.slice(streamed.length);
        if (delta) writeDelta(delta);
        endTextPart();
        return;
      }
      // A restarted or repaired attempt committed a different reply than the
      // one partially streamed. Close the stale part and hand the client the
      // authoritative text to render in its place.
      endTextPart();
      writer.write({
        type: "data-workspace-final-text",
        id: `${partId}-final`,
        data: { text: content },
      });
    },
    close: () => {
      if (done) return;
      done = true;
      endTextPart();
    },
  };
};
