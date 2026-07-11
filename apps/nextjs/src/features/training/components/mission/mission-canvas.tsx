"use client";

import type { UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, isTextUIPart } from "ai";

import type { RouterOutputs } from "@acme/api";
import { toast } from "@acme/ui/toast";
import {
  MissionQuestionArgsSchema,
  ProposeMissionsArgsSchema,
} from "@acme/validators";

import { AssistantRichText } from "~/features/training/components/assistant-rich-text";
import { useTRPC } from "~/trpc/react";
import { ConsultSheet } from "./consult-sheet";
import { MissionChoiceCards } from "./mission-choice-card";
import { MissionPlanCard } from "./mission-plan-card";
import { ProofComposer } from "./proof-composer";
import { QuestionCard } from "./question-card";

type MissionHydration = RouterOutputs["missions"]["getForUnitRun"];
const latestTool = (messages: UIMessage[], name: string) => {
  for (const message of [...messages].reverse())
    for (const part of [...message.parts].reverse()) {
      if (part.type === `tool-${name}`)
        return "output" in part
          ? part.output
          : "input" in part
            ? part.input
            : null;
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
  const [startedMission, setStartedMission] = useState(
    initialMission?.status === "active",
  );
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const missionQuery = useQuery({
    ...trpc.missions.getForUnitRun.queryOptions({ unitRunId }),
    initialData: initialMission,
  });
  const mission = missionQuery.data;
  const initialMessages = (initialMission?.messages ?? []).filter(
    (message): message is UIMessage =>
      Boolean(
        message &&
          typeof message === "object" &&
          "parts" in message &&
          Array.isArray(message.parts),
      ),
  );
  const transport = useMemo(
    () => new DefaultChatTransport<UIMessage>({ api: "/api/mission/chat" }),
    [],
  );
  const { messages, sendMessage, error, clearError } = useChat<UIMessage>({
    messages: initialMessages,
    transport,
    onFinish: () => {
      void queryClient.invalidateQueries(
        trpc.missions.getForUnitRun.queryFilter({ unitRunId }),
      );
    },
  });
  const startMission = useMutation(
    trpc.missions.start.mutationOptions({
      onMutate: () => setStartedMission(true),
      onSuccess: () =>
        queryClient.invalidateQueries(
          trpc.missions.getForUnitRun.queryFilter({ unitRunId }),
        ),
      onError: (mutationError) => {
        setStartedMission(false);
        toast.error(mutationError.message);
      },
    }),
  );
  const started = useRef(
    initialMessages.length > 0 ||
      initialMission?.status === "completed" ||
      initialMission?.status === "skipped",
  );
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void sendMessage(
      { text: "Start mission interview." },
      { body: { unitRunId } },
    );
  }, [sendMessage, unitRunId]);
  const askResult = MissionQuestionArgsSchema.safeParse(
    latestTool(messages, "ask"),
  );
  const proposedResult = ProposeMissionsArgsSchema.safeParse(
    latestTool(messages, "propose_missions"),
  );
  const ask = askResult.success ? askResult.data : null;
  const missions = proposedResult.success ? proposedResult.data.missions : null;
  const spec = mission?.spec ?? null;
  const plan = mission?.plan ?? null;
  const debrief = mission?.debrief ?? null;
  const active = startedMission || mission?.status === "active";
  const submit = (
    text: string,
    proof?: { text: string; imageUrls: string[] },
  ) => {
    clearError();
    void sendMessage({ text }, { body: { unitRunId, proof } });
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
                submit("I completed the mission and submitted my proof.", {
                  text,
                  imageUrls,
                })
              }
            />
          </>
        ) : spec && plan ? (
          <div className="mt-6">
            <MissionPlanCard
              spec={spec}
              plan={plan}
              onStart={() => startMission.mutate({ unitRunId })}
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
              options={ask.options}
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
