"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import {
  Surface,
  SurfaceDescription,
  SurfaceHeader,
  SurfaceTitle,
} from "@acme/ui/surface";
import { Textarea } from "@acme/ui/textarea";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";

type ActiveScenario = RouterOutputs["esdeSimulation"]["activeScenario"];

interface ScenarioWorkspaceProps {
  scenario: ActiveScenario;
}

const formatReadinessLabel = (
  readiness: RouterOutputs["esdeSimulation"]["submitResponse"]["readiness"],
) => {
  switch (readiness) {
    case "ready_for_next_round":
      return "Ready for next round";
    case "developing":
      return "Developing";
    case "needs_repair":
      return "Needs repair";
  }
};

export function ScenarioWorkspace({ scenario }: ScenarioWorkspaceProps) {
  const trpc = useTRPC();
  const [response, setResponse] = useState("");

  const responseWordCount = response.trim().split(/\s+/).filter(Boolean).length;

  const submitResponse = useMutation(
    trpc.esdeSimulation.submitResponse.mutationOptions({
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const canSubmit = response.trim().length >= 40 && !submitResponse.isPending;

  return (
    <main className="bp-page-bg min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <Surface
        variant="default"
        padding="none"
        className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-7xl flex-col shadow-[0_32px_140px_rgba(2,6,23,0.34)]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Button
              asChild
              variant="outline"
              className="border-border/80 bg-card hover:bg-secondary hover:text-foreground"
            >
              <Link href="/">
                <span aria-hidden="true">←</span>
                Domains
              </Link>
            </Button>
            <div className="space-y-1">
              <p className="text-xs font-medium tracking-[0.24em] uppercase text-muted-foreground">
                {scenario.domainTitle} / {scenario.activeStage}
              </p>
              <h1 className="font-display text-lg font-semibold tracking-[-0.03em] text-foreground sm:text-xl">
                {scenario.prompt.title}
              </h1>
            </div>
          </div>

          <Badge variant="success" className="hidden sm:inline-flex">
            E.S.D.E. Simulation
          </Badge>
        </header>

        <div className="flex flex-1 flex-col">
          <section className="flex min-h-[40vh] items-center justify-center border-b border-border/70 px-6 py-10">
            <div className="w-full max-w-4xl space-y-6 text-center">
              <Badge variant="outline" className="mx-auto">
                <span aria-hidden="true" className="text-primary">
                  •
                </span>
                Simulate
              </Badge>

              <p className="text-balance font-display text-lg leading-9 text-foreground sm:text-2xl sm:leading-10">
                {scenario.prompt.narrative}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {scenario.prompt.focusAreas.map((focusArea) => (
                  <Badge key={focusArea} variant="muted" className="text-[10px]">
                    {focusArea}
                  </Badge>
                ))}
              </div>
            </div>
          </section>

          <section className="flex min-h-[60vh] flex-1 flex-col gap-6 px-6 py-6">
            <div className="grid flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <Surface
                variant="default"
                padding="none"
                className="flex min-h-[420px] flex-col"
              >
                <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
                  <div>
                    <p className="text-xs font-medium tracking-[0.22em] uppercase text-muted-foreground">
                      Response
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Explain the failure, your first move, and the durable fix.
                    </p>
                  </div>
                  <div className="text-xs font-medium tracking-[0.18em] uppercase text-muted-foreground">
                    {responseWordCount} words
                  </div>
                </div>

                <Textarea
                  value={response}
                  onChange={(event) => setResponse(event.target.value)}
                  placeholder="Think like the person who owns the blast radius. What is failing, what do you do first, how do you verify it, and what structural fix prevents a repeat?"
                  className="min-h-[340px] flex-1 resize-none border-0 bg-transparent px-5 py-5 text-base leading-8 text-foreground shadow-none focus-visible:ring-0"
                />

                <div className="flex flex-col gap-4 border-t border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    Minimum signal threshold: 40 characters. Strong answers
                    usually explain diagnosis, containment, observability, and
                    durable design.
                  </div>
                  <Button
                    type="button"
                    disabled={!canSubmit}
                    className="h-11 bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    onClick={() =>
                      submitResponse.mutate({
                        domainSlug: scenario.domainSlug,
                        scenarioId: scenario.id,
                        response,
                      })
                    }
                  >
                    {submitResponse.isPending
                      ? "Diagnosing..."
                      : "Submit for grading"}
                  </Button>
                </div>
              </Surface>

              <Surface
                variant="muted"
                padding="md"
                className="flex min-h-[420px] flex-col"
              >
                <SurfaceHeader className="space-y-2">
                  <p className="text-xs font-medium tracking-[0.22em] uppercase text-muted-foreground">
                    Evaluation
                  </p>
                  <SurfaceTitle className="text-lg">
                    {submitResponse.data
                      ? formatReadinessLabel(submitResponse.data.readiness)
                      : "Waiting for response"}
                  </SurfaceTitle>
                </SurfaceHeader>

                {submitResponse.data ? (
                  <div className="mt-6 flex flex-1 flex-col gap-6">
                    <Surface variant="emphasis" padding="sm">
                      <p className="text-xs font-medium tracking-[0.18em] uppercase text-primary/80">
                        Score
                      </p>
                      <p className="font-display mt-2 text-4xl font-semibold tracking-[-0.05em] text-foreground">
                        {submitResponse.data.score}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Next stage: {submitResponse.data.nextStage}
                      </p>
                    </Surface>

                    <div className="space-y-4">
                      <section className="space-y-3">
                        <h3 className="text-sm font-medium text-foreground">
                          What worked
                        </h3>
                        <ul className="space-y-2 text-sm leading-7 text-muted-foreground">
                          {submitResponse.data.strengths.map((strength) => (
                            <li key={strength}>{strength}</li>
                          ))}
                        </ul>
                      </section>

                      <section className="space-y-3">
                        <h3 className="text-sm font-medium text-foreground">
                          Repair targets
                        </h3>
                        <ul className="space-y-2 text-sm leading-7 text-muted-foreground">
                          {submitResponse.data.improvements.map((improvement) => (
                            <li key={improvement}>{improvement}</li>
                          ))}
                        </ul>
                      </section>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 flex flex-1 flex-col justify-between gap-6">
                    <div className="space-y-3 text-sm leading-7 text-muted-foreground">
                      <p>
                        This first version uses a deterministic rubric so the
                        orchestration flow is in place before AI grading lands.
                      </p>
                      <p>
                        The evaluator currently looks for diagnosis,
                        prioritization, observability, and mitigation quality.
                      </p>
                    </div>

                    <SurfaceDescription className="border border-border/70 bg-card/70 p-4">
                      Submit an answer to see score, readiness, and repair
                      guidance.
                    </SurfaceDescription>
                  </div>
                )}
              </Surface>
            </div>
          </section>
        </div>
      </Surface>
    </main>
  );
}
