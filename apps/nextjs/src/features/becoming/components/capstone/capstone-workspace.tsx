"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";
import { AssistantRichText } from "../assistant-rich-text";
import { BuildCapstone } from "./build-capstone";
import { DebateCapstone } from "./debate-capstone";
import { TeachCapstone } from "./teach-capstone";

type CapstoneState = RouterOutputs["becoming"]["getCapstone"];

export function CapstoneWorkspace({
  state,
  sessionId,
  embedded = false,
  onRunningChange,
}: {
  state: CapstoneState;
  sessionId: string;
  embedded?: boolean;
  onRunningChange?: (isRunning: boolean) => void;
}) {
  const trpc = useTRPC();
  const [response, setResponse] = useState("");
  const [capstone, setCapstone] = useState(state.capstone);
  const [messages, setMessages] = useState(state.messages);

  const submitCapstoneMessage = useMutation(
    trpc.becoming.submitCapstoneMessage.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );

  useEffect(() => {
    onRunningChange?.(submitCapstoneMessage.isPending);
    return () => onRunningChange?.(false);
  }, [onRunningChange, submitCapstoneMessage.isPending]);

  const handleSubmit = async () => {
    const trimmed = response.trim();
    if (trimmed.length < 50) {
      return;
    }

    const nextRound = capstone.currentRound + 1;

    const result = await submitCapstoneMessage.mutateAsync({
      nodeId: capstone.simulationNodeId,
      sessionId,
      response: trimmed,
    });

    const nextMessages = [
      ...messages,
      {
        id: `local-user-${Date.now()}`,
        capstoneId: capstone.id,
        role: "user" as const,
        content: trimmed,
        sequence: messages.length,
        round: nextRound,
        createdAt: new Date(),
      },
    ];

    if (result.assistantReply) {
      nextMessages.push({
        id: `local-assistant-${Date.now()}`,
        capstoneId: capstone.id,
        role: "assistant",
        content: result.assistantReply,
        sequence: messages.length + 1,
        round: nextRound,
        createdAt: new Date(),
      });
    }

    setMessages(nextMessages);
    setCapstone((current) => ({
      ...current,
      status: result.status,
      currentRound: result.round,
      score: result.score,
      feedback: result.feedback,
    }));
    setResponse("");
  };

  const workspaceHref = `/workspace?session=${sessionId}`;
  const isComplete =
    capstone.status === "passed" || capstone.status === "failed";
  const remainingRounds = Math.max(
    capstone.maxRounds - capstone.currentRound,
    0,
  );

  const shell = (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      {!embedded ? (
        <div className="border-border flex items-center justify-between border-b pb-6">
          <div>
            <div className="text-muted-foreground font-mono text-xs tracking-[0.24em] uppercase">
              Cluster capstone
            </div>
            <h1 className="font-display mt-4 text-3xl tracking-[-0.05em] sm:text-4xl">
              {capstone.scenario.title}
            </h1>
          </div>
          <Button
            asChild
            variant="outline"
            className="border-border text-foreground hover:bg-accent hover:text-foreground h-11 bg-transparent px-5"
          >
            <Link href={workspaceHref}>Workspace</Link>
          </Button>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="border-border bg-card border p-4">
          <div className="text-muted-foreground font-mono text-xs tracking-[0.18em] uppercase">
            Format
          </div>
          <div className="text-foreground mt-3 text-sm capitalize">
            {capstone.format}
          </div>
        </div>
        <div className="border-border bg-card border p-4">
          <div className="text-muted-foreground font-mono text-xs tracking-[0.18em] uppercase">
            Status
          </div>
          <div className="text-foreground mt-3 text-sm capitalize">
            {capstone.status.replaceAll("_", " ")}
          </div>
        </div>
        <div className="border-border bg-card border p-4">
          <div className="text-muted-foreground font-mono text-xs tracking-[0.18em] uppercase">
            Score
          </div>
          <div className="text-foreground mt-3 text-sm">
            {capstone.score ?? "Pending"}
          </div>
        </div>
      </section>

      {capstone.scenario.format === "build" ? (
        <BuildCapstone
          scenario={capstone.scenario}
          messages={messages}
          response={response}
          onResponseChange={setResponse}
          onSubmit={handleSubmit}
          isSubmitting={submitCapstoneMessage.isPending}
          status={capstone.status}
          remainingRounds={remainingRounds}
        />
      ) : null}

      {capstone.scenario.format === "debate" ? (
        <DebateCapstone
          scenario={capstone.scenario}
          messages={messages}
          response={response}
          onResponseChange={setResponse}
          onSubmit={handleSubmit}
          isSubmitting={submitCapstoneMessage.isPending}
          status={capstone.status}
          currentRound={capstone.currentRound}
          maxRounds={capstone.maxRounds}
        />
      ) : null}

      {capstone.scenario.format === "teach" ? (
        <TeachCapstone
          scenario={capstone.scenario}
          messages={messages}
          response={response}
          onResponseChange={setResponse}
          onSubmit={handleSubmit}
          isSubmitting={submitCapstoneMessage.isPending}
          status={capstone.status}
          currentRound={capstone.currentRound}
          maxRounds={capstone.maxRounds}
        />
      ) : null}

      {(isComplete || capstone.feedback) && (
        <section className="border-border bg-card border p-6">
          <div className="text-muted-foreground font-mono text-xs tracking-[0.18em] uppercase">
            Final evaluation
          </div>
          <AssistantRichText
            content={capstone.feedback ?? "Evaluation pending."}
            className="text-muted-foreground mt-4 text-sm leading-7"
          />
        </section>
      )}
    </div>
  );

  if (embedded) {
    return shell;
  }

  return (
    <main className="bp-page-bg text-foreground min-h-screen px-5 py-8 sm:px-8 lg:px-10">
      {shell}
    </main>
  );
}
