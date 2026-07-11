"use client";

import type { UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, isTextUIPart } from "ai";
import { AnimatePresence, motion } from "motion/react";

import type { RouterOutputs } from "@acme/api";
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
} from "@acme/ui/progress";
import { toast } from "@acme/ui/toast";
import {
  MissionQuestionArgsSchema,
  ProposeMissionsArgsSchema,
} from "@acme/validators";

import { AssistantRichText } from "~/features/training/components/assistant-rich-text";
import { useTRPC } from "~/trpc/react";
import { missionMotion } from "./animation";
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
  const router = useRouter();
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
  const { messages, sendMessage, status, error, clearError } =
    useChat<UIMessage>({
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
  const moveToNextAbility = useMutation(
    trpc.training.advanceCompletedUnit.mutationOptions({
      onSuccess: () => {
        if (!mission) return;
        router.push(
          `/workspace?session=${encodeURIComponent(mission.sessionId)}`,
        );
      },
      onError: (mutationError) => toast.error(mutationError.message),
    }),
  );
  const started = useRef(
    initialMessages.length > 0 || initialMission?.status === "completed",
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
  const evaluations =
    mission?.evaluations.filter(
      (attempt) => attempt.status === "evaluated" && attempt.evaluation,
    ) ?? [];
  const latestEvaluation = evaluations.at(-1)?.evaluation ?? null;
  const isEvaluating = status === "submitted" || status === "streaming";
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

  // One stage at a time, mirrored in the eyebrow so the learner always knows
  // where they are. Order matches the rendering priority below.
  const stage = debrief
    ? "debrief"
    : active && spec && plan
      ? "active"
      : spec && plan
        ? "plan"
        : missions
          ? "choices"
          : ask
            ? "ask"
            : "searching";
  const stageLabel = {
    ask: "01 — SHAPE",
    choices: "02 — CHOOSE",
    plan: "03 — COMMIT",
    active: "04 — PROVE",
    debrief: "COMPLETE",
    searching: null,
  }[stage];

  return (
    <main className="bp-site min-h-dvh w-full">
      <div className="mx-auto w-full max-w-[560px] px-6 py-16">
        <p className="font-mono text-[12px] tracking-[0.18em] text-[var(--site-text-3)]">
          MISSION
          {stageLabel ? (
            <span className="text-[var(--site-text-2)]"> · {stageLabel}</span>
          ) : null}
        </p>
        {error ? (
          <button
            type="button"
            onClick={() => {
              clearError();
              submit("Please retry that.");
            }}
            className="mt-5 text-[14px] text-[var(--site-text-2)] underline underline-offset-[3px] transition-colors outline-none hover:text-[var(--site-fg)]"
          >
            The mission guide paused. Retry
          </button>
        ) : null}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={missionMotion}
          >
            {latestText ? (
              <div className="mt-6">
                <AssistantRichText content={latestText} />
              </div>
            ) : null}
            {debrief ? (
              <section className="mt-8 rounded-lg border border-[var(--site-line)] bg-[var(--site-raised)] p-6">
                <p className="text-[17px] font-medium tracking-[-0.01em] text-[var(--site-fg)]">
                  Mission complete
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--site-text-2)]">
                  {debrief}
                </p>
                <button
                  type="button"
                  disabled={!mission || moveToNextAbility.isPending}
                  onClick={() => {
                    if (!mission) return;
                    moveToNextAbility.mutate({
                      sessionId: mission.sessionId,
                      nodeId: mission.nodeId,
                    });
                  }}
                  className="mt-5 inline-block text-[14px] text-[var(--site-text-2)] underline underline-offset-[3px] transition-colors hover:text-[var(--site-fg)] disabled:cursor-wait disabled:opacity-60"
                >
                  {moveToNextAbility.isPending
                    ? "Preparing next ability…"
                    : "Move on to next →"}
                </button>
              </section>
            ) : active && spec && plan ? (
              <>
                <div className="mt-8">
                  <MissionPlanCard spec={spec} plan={plan} readOnly />
                </div>
                <div className="mt-10">
                  {latestEvaluation && !latestEvaluation.passed ? (
                    <section
                      aria-live="polite"
                      className="mb-5 border-t border-[var(--site-line)] pt-5"
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="text-[14px] font-medium text-[var(--site-fg)]">
                          {latestEvaluation.score >= 55
                            ? "Almost there"
                            : "Needs another pass"}{" · "}
                          {latestEvaluation.score}/100
                        </p>
                        <p className="font-mono text-[11px] text-[var(--site-text-3)]">
                          Standard: 70
                        </p>
                      </div>
                      <p className="mt-2 text-[14px] leading-relaxed text-[var(--site-text-2)]">
                        {latestEvaluation.summary}
                      </p>
                      {latestEvaluation.nextStep ? (
                        <p className="mt-2 text-[14px] leading-relaxed text-[var(--site-fg)]">
                          Next: {latestEvaluation.nextStep}
                        </p>
                      ) : null}
                      <Progress
                        value={Math.min(
                          (latestEvaluation.attemptNumber / 4) * 100,
                          100,
                        )}
                        className="mt-4 gap-2"
                      >
                        <ProgressLabel className="font-mono text-[11px] font-normal text-[var(--site-text-3)]">
                          {latestEvaluation.attemptNumber <= 4
                            ? `Submission ${latestEvaluation.attemptNumber} of 4 guided attempts`
                            : `Standards review ${latestEvaluation.attemptNumber}`}
                        </ProgressLabel>
                        <ProgressTrack className="h-1 bg-[var(--site-line)]">
                          <ProgressIndicator className="bg-[var(--site-fg)]" />
                        </ProgressTrack>
                      </Progress>
                    </section>
                  ) : null}
                  {isEvaluating ? (
                    <Progress
                      value={null}
                      className="mb-5"
                      aria-label="Evaluating proof"
                    >
                      <ProgressLabel className="text-[13px] font-normal text-[var(--site-text-2)]">
                        Checking your proof against the mission standard…
                      </ProgressLabel>
                      <ProgressTrack className="h-1 bg-[var(--site-line)]">
                        <ProgressIndicator className="bg-[var(--site-fg)]" />
                      </ProgressTrack>
                    </Progress>
                  ) : null}
                  <ProofComposer
                    disabled={isEvaluating}
                    onSubmit={(text, imageUrls) =>
                      submit(
                        "I completed the mission and submitted my proof.",
                        {
                          text,
                          imageUrls,
                        },
                      )
                    }
                  />
                </div>
              </>
            ) : spec && plan ? (
              <div className="mt-8">
                <MissionPlanCard
                  spec={spec}
                  plan={plan}
                  onStart={() => startMission.mutate({ unitRunId })}
                  onConsult={() => setConsultOpen(true)}
                />
              </div>
            ) : missions ? (
              <div className="mt-8">
                <MissionChoiceCards
                  missions={missions}
                  onPick={(mission) => submit(`I choose: ${mission.title}`)}
                  onOther={() => setConsultOpen(true)}
                />
              </div>
            ) : ask ? (
              <div className="mt-8">
                <QuestionCard
                  question={question}
                  options={ask.options}
                  onAnswer={submit}
                />
              </div>
            ) : (
              <p className="mt-6 text-[14px] text-[var(--site-text-2)]">
                Finding a mission that fits you…
              </p>
            )}
          </motion.div>
        </AnimatePresence>
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
