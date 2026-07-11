"use client";

import type { UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart } from "ai";

import type { MissionPlan, MissionSpec, MissionStatus } from "@acme/validators";

import { AssistantRichText } from "~/features/training/components/assistant-rich-text";
import { ConsultSheet } from "./consult-sheet";
import { MissionChoiceCards } from "./mission-choice-card";
import { MissionPlanCard } from "./mission-plan-card";
import { ProofComposer } from "./proof-composer";
import { QuestionCard } from "./question-card";

type MissionHydration = {
  status: MissionStatus;
  spec: MissionSpec | null;
  plan: MissionPlan | null;
  debrief: string | null;
  messages: unknown[];
} | null;
type ToolPayload = Record<string, unknown>;
const object = (value: unknown): ToolPayload | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as ToolPayload)
    : null;
const asSpecs = (value: unknown): MissionSpec[] | null =>
  Array.isArray(value) ? (value as MissionSpec[]) : null;

const latestTool = (messages: UIMessage[], name: string) => {
  for (const message of [...messages].reverse())
    for (const part of [...message.parts].reverse()) {
      if (part.type === `tool-${name}`)
        return object(
          "output" in part ? part.output : "input" in part ? part.input : null,
        );
    }
  return null;
};

export function MissionCanvas({
  unitRunId,
  initialMission,
}: {
  unitRunId: string;
  initialMission: MissionHydration;
}) {
  const [consultOpen, setConsultOpen] = useState(false);
  const initialMessages = (initialMission?.messages ?? []).filter(
    (message): message is UIMessage =>
      Boolean(object(message) && Array.isArray(object(message)?.parts)),
  );
  const transport = useMemo(
    () => new DefaultChatTransport<UIMessage>({ api: "/api/mission/chat" }),
    [],
  );
  const { messages, sendMessage, error, clearError } = useChat<UIMessage>({
    messages: initialMessages,
    transport,
  });
  const started = useRef(initialMessages.length > 0);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void sendMessage(
      { text: "Start mission interview." },
      { body: { unitRunId } },
    );
  }, [sendMessage, unitRunId]);
  const ask = latestTool(messages, "ask");
  const proposed = latestTool(messages, "propose_missions");
  const finalized =
    latestTool(messages, "finalize_plan") ?? latestTool(messages, "edit_plan");
  const completed = latestTool(messages, "complete_mission");
  const spec =
    (object(finalized)?.spec as MissionSpec | undefined) ??
    initialMission?.spec ??
    null;
  const plan =
    (object(finalized)?.plan as MissionPlan | undefined) ??
    initialMission?.plan ??
    null;
  const missions = asSpecs(object(proposed)?.missions) ?? null;
  const debrief =
    (object(completed)?.debrief as string | undefined) ??
    initialMission?.debrief ??
    null;
  const active =
    initialMission?.status === "active" ||
    Boolean(latestTool(messages, "start_mission"));
  const submit = (text: string) => {
    clearError();
    void sendMessage({ text }, { body: { unitRunId } });
  };
  const latestText =
    [...messages]
      .reverse()
      .find((message) => message.role === "assistant")
      ?.parts.filter(isTextUIPart)
      .map((part) => part.text)
      .join("") ?? "";

  const question =
    typeof ask?.question === "string"
      ? ask.question
      : "What would you like to get from this?";
  return (
    <main className="bg-background text-foreground min-h-dvh">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <p className="text-muted-foreground font-mono text-xs tracking-[0.18em]">
          MISSION
        </p>
        {error ? (
          <button
            type="button"
            onClick={() => {
              clearError();
              submit("Please retry that.");
            }}
            className="mt-5 text-sm underline"
          >
            The mission guide paused. Retry
          </button>
        ) : null}
        {latestText ? (
          <div className="mt-5">
            <AssistantRichText content={latestText} />
          </div>
        ) : null}
        {debrief ? (
          <section className="border-border bg-card mt-6 border p-6">
            <p className="text-lg">✓ Mission complete</p>
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              {debrief}
            </p>
            <a
              href="/workspace"
              className="mt-6 inline-block text-sm underline"
            >
              Back to path →
            </a>
          </section>
        ) : active && spec && plan ? (
          <>
            <div className="mt-6">
              <MissionPlanCard spec={spec} plan={plan} readOnly />
            </div>
            <ProofComposer
              onSubmit={(text, imageUrls) =>
                submit(
                  `I completed the mission. Proof: ${text || "Photo attached."}\nImages: ${imageUrls.join(", ")}`,
                )
              }
            />
          </>
        ) : spec && plan ? (
          <div className="mt-6">
            <MissionPlanCard
              spec={spec}
              plan={plan}
              onStart={() => submit("Start mission now.")}
              onConsult={() => setConsultOpen(true)}
            />
          </div>
        ) : missions ? (
          <div className="mt-6">
            <MissionChoiceCards
              missions={missions}
              onPick={(mission) => submit(`I choose: ${mission.title}`)}
              onOther={() => setConsultOpen(true)}
            />
          </div>
        ) : ask ? (
          <div className="mt-6">
            <QuestionCard
              question={question}
              options={
                Array.isArray(ask.options)
                  ? ask.options.filter(
                      (option): option is string => typeof option === "string",
                    )
                  : []
              }
              onAnswer={submit}
            />
          </div>
        ) : (
          <p className="text-muted-foreground mt-6 text-sm">
            Finding a mission that fits you…
          </p>
        )}
      </div>
      <ConsultSheet
        open={consultOpen}
        onClose={() => setConsultOpen(false)}
        onSend={(message) => {
          setConsultOpen(false);
          submit(message);
        }}
      />
    </main>
  );
}
