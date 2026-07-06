"use client";

import type { UIMessage } from "ai";
import { useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { isTextUIPart } from "ai";

import type { ChunkMode, MockTransportOptions } from "./mock-transport";
import type { ChatDesign } from "./types";
import { CURRENT_DESIGN } from "./current";
import { EXPERIMENTAL_DESIGNS } from "./experimental";
import { CHAT_FIXTURES } from "./fixtures";
import { MockChatTransport } from "./mock-transport";
import { ReasoningPanel, ReasoningShimmer } from "./reasoning-panel";

type ReasoningStyle = "shimmer" | "panel";

const REASONING_STYLES: { id: ReasoningStyle; label: string }[] = [
  { id: "shimmer", label: "Shimmer" },
  { id: "panel", label: "Panel" },
];

const CHUNK_MODES: { id: ChunkMode; label: string }[] = [
  { id: "char", label: "Char" },
  { id: "word", label: "Word" },
  { id: "token", label: "Token" },
];

// The current site's rendering plus any experiments, in one flat list —
// experiments are marked so it's obvious which one is production.
const ALL_DESIGNS: (ChatDesign & { experimental?: boolean })[] = [
  CURRENT_DESIGN,
  ...EXPERIMENTAL_DESIGNS.map((d) => ({ ...d, experimental: true })),
];

const getMessageText = (message: UIMessage) =>
  message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");

// Reasoning parts stream in before the answer text. `state` is "streaming"
// until the reasoning-end chunk arrives.
const getMessageReasoning = (message: UIMessage) => {
  let text = "";
  let streaming = false;
  for (const part of message.parts) {
    if (part.type !== "reasoning") continue;
    text += part.text;
    if (part.state === "streaming") streaming = true;
  }
  return { text, streaming };
};

export default function ChatLabPage() {
  const [designId, setDesignId] = useState(CURRENT_DESIGN.id);
  const [fixtureId, setFixtureId] = useState(CHAT_FIXTURES[0]!.id);
  const [chunkMode, setChunkMode] = useState<ChunkMode>("word");
  const [delayMs, setDelayMs] = useState(30);
  const [reasoningOn, setReasoningOn] = useState(true);
  const [reasoningStyle, setReasoningStyle] =
    useState<ReasoningStyle>("shimmer");

  const design =
    ALL_DESIGNS.find((d) => d.id === designId) ?? CURRENT_DESIGN;
  const fixture =
    CHAT_FIXTURES.find((f) => f.id === fixtureId) ?? CHAT_FIXTURES[0]!;

  // The transport resolves options lazily so changing fixture/speed never
  // recreates useChat.
  const optionsRef = useRef<MockTransportOptions>({
    text: fixture.text,
    chunkMode,
    delayMs,
  });
  optionsRef.current = {
    text: fixture.text,
    reasoningText: reasoningOn ? fixture.reasoning : undefined,
    chunkMode,
    delayMs,
  };

  const transport = useMemo(
    () => new MockChatTransport<UIMessage>(() => optionsRef.current),
    [],
  );

  const { messages, setMessages, sendMessage, status, stop } =
    useChat<UIMessage>({
      id: "chat-lab",
      transport,
      experimental_throttle: 50,
    });

  const isRunning = status === "submitted" || status === "streaming";
  const assistantMessages = messages.filter((m) => m.role === "assistant");

  const stream = () => {
    setMessages([]);
    void sendMessage({ text: fixture.label });
  };

  const reset = () => {
    if (isRunning) void stop();
    setMessages([]);
  };

  return (
    <main className="min-h-screen bg-[#06070a] text-white">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-5 py-8 lg:grid-cols-[280px_1fr] lg:px-10">
        {/* Left rail: what to stream, and how to render it */}
        <aside className="flex flex-col gap-8">
          <div>
            <h1 className="font-display text-3xl tracking-[-0.05em]">
              Chat Lab
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/55">
              A test bench for assistant-message rendering. Pick a message,
              press <span className="text-white/80">Stream</span>, and watch it
              paint through the real <code className="text-white/75">useChat</code>{" "}
              pipeline — only the network is faked.
            </p>
          </div>

          <Section
            title="1 · Message"
            hint="The assistant reply the mock server will stream."
          >
            {CHAT_FIXTURES.map((f) => (
              <RailButton
                key={f.id}
                active={f.id === fixtureId}
                onClick={() => setFixtureId(f.id)}
                label={f.label}
                description={f.description}
              />
            ))}
          </Section>

          <Section
            title="2 · Renderer"
            hint="How the streamed text is painted on screen."
          >
            {ALL_DESIGNS.map((d) => (
              <RailButton
                key={d.id}
                active={d.id === designId}
                onClick={() => setDesignId(d.id)}
                label={d.experimental ? `${d.label} · experimental` : d.label}
                description={d.description}
              />
            ))}
          </Section>
        </aside>

        {/* Right: run controls + chat preview */}
        <section className="flex min-h-[70dvh] flex-col gap-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-white/8 pb-5">
            <button
              onClick={isRunning ? () => void stop() : stream}
              className={`px-5 py-2 text-sm font-medium transition-colors ${
                isRunning
                  ? "border border-white/25 text-white hover:bg-white/5"
                  : "bg-white text-black"
              }`}
            >
              {isRunning ? "⏸ Stop" : "▶ Stream"}
            </button>
            <button
              onClick={reset}
              disabled={messages.length === 0}
              className="border border-white/15 px-4 py-2 text-sm transition-colors hover:bg-white/5 disabled:opacity-30"
            >
              ↺ Clear
            </button>

            <div className="ml-auto flex flex-wrap items-center gap-5">
              <Toggle
                label="Reasoning"
                checked={reasoningOn}
                onChange={setReasoningOn}
              />

              {reasoningOn ? (
                <div
                  className="flex overflow-hidden border border-white/15"
                  title="How reasoning shows: Shimmer = animated status label only; Panel = auto-open trace"
                >
                  {REASONING_STYLES.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setReasoningStyle(style.id)}
                      className={`px-3 py-1.5 text-xs transition-colors ${
                        reasoningStyle === style.id
                          ? "bg-white text-black"
                          : "text-white/60 hover:bg-white/5"
                      }`}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-xs text-white/60">
                Speed
                <input
                  type="range"
                  min={0}
                  max={120}
                  step={5}
                  value={delayMs}
                  onChange={(e) => setDelayMs(Number(e.target.value))}
                  className="accent-white"
                />
                <span className="w-10 tabular-nums text-white/80">
                  {delayMs}ms
                </span>
              </label>

              <div
                className="flex overflow-hidden border border-white/15"
                title="Chunk granularity: how much text arrives per stream event"
              >
                {CHUNK_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setChunkMode(mode.id)}
                    className={`px-3 py-1.5 text-xs transition-colors ${
                      chunkMode === mode.id
                        ? "bg-white text-black"
                        : "text-white/60 hover:bg-white/5"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1">
            {assistantMessages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <p className="text-sm text-white/50">
                  Press <span className="text-white/80">▶ Stream</span> to run{" "}
                  <span className="text-white/80">{fixture.label}</span>.
                </p>
                <p className="max-w-sm text-xs leading-6 text-white/35">
                  {!reasoningOn
                    ? "Reasoning is off — the answer streams immediately."
                    : reasoningStyle === "shimmer"
                      ? "Shimmer style: an animated status label plays while the model “thinks”, then gives way to the answer — no trace shown."
                      : "Panel style: the reasoning trace opens on its own while the model “thinks”, then collapses when the answer starts."}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {assistantMessages.map((message) => {
                  const reasoning = getMessageReasoning(message);
                  return (
                    <div key={message.id}>
                      {reasoningStyle === "shimmer" ? (
                        <ReasoningShimmer
                          reasoning={reasoning.text}
                          streaming={reasoning.streaming}
                        />
                      ) : (
                        <ReasoningPanel
                          reasoning={reasoning.text}
                          streaming={reasoning.streaming}
                        />
                      )}
                      {design.render(getMessageText(message))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-white/40">
        {title}
      </div>
      <p className="mb-3 mt-1 text-xs leading-5 text-white/30">{hint}</p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function RailButton({
  active,
  onClick,
  label,
  description,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`border px-3 py-2 text-left transition-colors ${
        active
          ? "border-white/25 bg-white/[0.07]"
          : "border-white/8 hover:bg-white/[0.04]"
      }`}
    >
      <div className="text-sm text-white/90">{label}</div>
      <div className="mt-0.5 text-xs leading-5 text-white/45">{description}</div>
    </button>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-xs text-white/60 transition-colors hover:text-white/80"
    >
      {label}
      <span
        className={`relative h-4.5 w-8 rounded-full transition-colors ${
          checked ? "bg-white" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 size-3.5 rounded-full transition-[left,background-color] ${
            checked ? "left-4 bg-black" : "left-0.5 bg-white/70"
          }`}
        />
      </span>
    </button>
  );
}
