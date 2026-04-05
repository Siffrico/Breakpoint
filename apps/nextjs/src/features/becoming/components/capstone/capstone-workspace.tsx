"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";

import { BuildCapstone } from "./build-capstone";
import { DebateCapstone } from "./debate-capstone";
import { TeachCapstone } from "./teach-capstone";

type CapstoneState = RouterOutputs["becoming"]["getCapstone"];

export function CapstoneWorkspace({
  state,
  sessionId,
  embedded = false,
}: {
  state: CapstoneState;
  sessionId: string;
  embedded?: boolean;
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

  const workspaceHref = `/home?session=${sessionId}`;
  const isComplete = capstone.status === "passed" || capstone.status === "failed";
  const remainingRounds = Math.max(capstone.maxRounds - capstone.currentRound, 0);

  const shell = (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      {!embedded ? (
        <div className="flex items-center justify-between border-b border-border pb-6">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Cluster capstone
            </div>
            <h1 className="font-display mt-4 text-3xl tracking-[-0.05em] sm:text-4xl">
              {capstone.scenario.title}
            </h1>
          </div>
          <Button
            asChild
            variant="outline"
            className="h-11 border-border bg-transparent px-5 text-foreground hover:bg-accent hover:text-foreground"
          >
            <Link href={workspaceHref}>Workspace</Link>
          </Button>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
          <div className="border border-border bg-card p-4">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Format
            </div>
            <div className="mt-3 text-sm capitalize text-foreground">
              {capstone.format}
            </div>
          </div>
          <div className="border border-border bg-card p-4">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Status
            </div>
            <div className="mt-3 text-sm capitalize text-foreground">
              {capstone.status.replaceAll("_", " ")}
            </div>
          </div>
          <div className="border border-border bg-card p-4">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Score
            </div>
            <div className="mt-3 text-sm text-foreground">
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
        <section className="border border-border bg-card p-6">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Final evaluation
            </div>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              {capstone.feedback ?? "Evaluation pending."}
            </p>
        </section>
      )}
    </div>
  );

  if (embedded) {
    return shell;
  }

  return (
    <main className="bp-page-bg min-h-screen px-5 py-8 text-foreground sm:px-8 lg:px-10">
      {shell}
    </main>
  );
}
