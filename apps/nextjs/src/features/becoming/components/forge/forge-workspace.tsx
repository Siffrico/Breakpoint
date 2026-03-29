"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import {
  previewFailureGap,
  previewForgeDebrief,
  previewGhostScenario,
  previewPracticeResults,
  previewSeedResponse,
  previewTeachbackResult,
  previewTeachbackTranscript,
} from "~/features/becoming/lib/forge-preview";
import { useTRPC } from "~/trpc/react";

import { BuildPhase } from "./build-phase";
import { FailureIsolation } from "./failure-isolation";
import { PhaseIndicator } from "./phase-indicator";
import { PhaseTransition } from "./phase-transition";
import { PracticePhase } from "./practice-phase";
import { ProvePhase } from "./prove-phase";
import { SeedPhase } from "./seed-phase";
import { UnitDebrief } from "./unit-debrief";

type ForgeUnit = RouterOutputs["becoming"]["unit"];
type ForgePhase =
  | "seed"
  | "build"
  | "practice"
  | "prove"
  | "isolation"
  | "debrief";

export function ForgeWorkspace({
  unit,
  sessionId,
  preview = false,
}: {
  unit: ForgeUnit;
  sessionId: string;
  preview?: boolean;
}) {
  const trpc = useTRPC();
  const [phase, setPhase] = useState<ForgePhase>(
    unit.buildContent && unit.practicePrompts ? "build" : "seed",
  );
  const [transitioning, setTransitioning] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<ForgePhase | null>(null);
  const [completedPhases, setCompletedPhases] = useState<ForgePhase[]>(
    unit.buildContent && unit.practicePrompts ? ["seed"] : [],
  );
  const [seedResponse, setSeedResponse] = useState("");
  const [buildContent, setBuildContent] = useState<string | null>(unit.buildContent);
  const [practicePrompts, setPracticePrompts] = useState(unit.practicePrompts);

  const workspaceHref = preview ? "/ui/home" : `/home?session=${sessionId}`;

  const submitSeed = useMutation(
    trpc.becoming.submitSeed.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );
  const submitPractice = useMutation(
    trpc.becoming.submitPractice.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );
  const submitTeachback = useMutation(
    trpc.becoming.submitTeachback.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );
  const submitGhostResponse = useMutation(
    trpc.becoming.submitGhostResponse.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );

  const teachbackPromptQuery = useQuery({
    ...trpc.becoming.getTeachbackPrompt.queryOptions({
      nodeId: unit.nodeId,
      sessionId,
    }),
    enabled: !preview && phase === "prove",
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const failureIsolationQuery = useQuery({
    ...trpc.becoming.getFailureIsolation.queryOptions({
      nodeId: unit.nodeId,
      sessionId,
    }),
    enabled: !preview && phase === "isolation",
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const debriefQuery = useQuery({
    ...trpc.becoming.getForgeDebrief.queryOptions({
      nodeId: unit.nodeId,
      sessionId,
    }),
    enabled: !preview && phase === "debrief",
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const goToPhase = useCallback(
    (target: ForgePhase) => {
      setCompletedPhases((prev) =>
        prev.includes(phase) ? prev : [...prev, phase],
      );
      setTransitionTarget(target);
      setTransitioning(true);
    },
    [phase],
  );

  const handleTransitionComplete = useCallback(() => {
    if (transitionTarget) {
      setPhase(transitionTarget);
      setTransitioning(false);
      setTransitionTarget(null);
    }
  }, [transitionTarget]);

  const handleSeedSubmit = useCallback(
    async (response: string) => {
      const generation = preview
        ? {
            buildContent: unit.buildContent,
            practicePrompts: unit.practicePrompts,
          }
        : await submitSeed.mutateAsync({
            nodeId: unit.nodeId,
            sessionId,
            response,
          });

      if (!generation.buildContent || !generation.practicePrompts) {
        toast.error("Build content is not ready yet.");
        return;
      }

      setSeedResponse(response);
      setBuildContent(generation.buildContent);
      setPracticePrompts(generation.practicePrompts);
      goToPhase("build");
    },
    [
      goToPhase,
      preview,
      sessionId,
      submitSeed,
      unit.buildContent,
      unit.nodeId,
      unit.practicePrompts,
    ],
  );

  const handlePracticeSubmit = useCallback(
    async (index: number, response: string) => {
      if (preview) {
        return previewPracticeResults[index];
      }

      return submitPractice.mutateAsync({
        nodeId: unit.nodeId,
        sessionId,
        sequence: index,
        response,
      });
    },
    [preview, sessionId, submitPractice, unit.nodeId],
  );

  const handleBuildComplete = useCallback(() => {
    goToPhase("practice");
  }, [goToPhase]);

  const handlePracticeComplete = useCallback(() => {
    goToPhase("prove");
  }, [goToPhase]);

  const handleTeachbackSubmit = useCallback(
    async (round: number, response: string) => {
      if (preview) {
        const nextStudentMessage = previewTeachbackTranscript.find(
          (message) => message.role === "student" && message.round === round + 1,
        );

        if (nextStudentMessage && round < 3) {
          return {
            studentReply: nextStudentMessage.content,
            passed: false,
            round,
            score: null,
            feedback: null,
          };
        }

        return {
          studentReply: null,
          passed: previewTeachbackResult.passed,
          round,
          score: previewTeachbackResult.score,
          feedback: previewTeachbackResult.feedback,
        };
      }

      return submitTeachback.mutateAsync({
        nodeId: unit.nodeId,
        sessionId,
        round,
        response,
      });
    },
    [preview, sessionId, submitTeachback, unit.nodeId],
  );

  const handleProveComplete = useCallback(
    (passed: boolean) => {
      if (passed) {
        goToPhase("debrief");
      } else {
        goToPhase("isolation");
      }
    },
    [goToPhase],
  );

  const handleGhostSubmit = useCallback(
    async (response: string) => {
      if (preview) {
        return {
          passed: true,
          feedback: "Ghost scenario passed in preview mode.",
          score: 82,
        };
      }

      return submitGhostResponse.mutateAsync({
        nodeId: unit.nodeId,
        sessionId,
        response,
      });
    },
    [preview, sessionId, submitGhostResponse, unit.nodeId],
  );

  const handleGhostRetry = useCallback(async () => {
    if (preview) {
      return;
    }

    const result = await failureIsolationQuery.refetch();
    if (result.error) {
      toast.error(result.error.message);
    }
  }, [failureIsolationQuery, preview]);

  const handleIsolationComplete = useCallback(() => {
    goToPhase("debrief");
  }, [goToPhase]);

  const handleDebriefContinue = useCallback(() => {
    // Navigation follow-up can be added when next-unit routing is defined.
  }, []);

  const debriefData = preview
    ? {
        ...previewForgeDebrief,
        seedResponse: seedResponse || previewSeedResponse,
      }
    : debriefQuery.data;

  const teachbackPrompt =
    preview || !teachbackPromptQuery.data
      ? {
          studentMessage: unit.teachbackSetup.openingMisconception,
          round: 1,
        }
      : teachbackPromptQuery.data;

  const failureIsolationData = preview
    ? { gap: previewFailureGap, ghostScenario: previewGhostScenario }
    : failureIsolationQuery.data;

  return (
    <main className="bp-page-bg min-h-screen px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between border-b border-border pb-6">
          <div>
            <PhaseIndicator
              currentPhase={phase}
              completedPhases={completedPhases}
            />
            <h1 className="font-display mt-4 text-3xl tracking-[-0.05em] sm:text-4xl">
              {unit.title}
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

        {transitioning && transitionTarget && (
          <PhaseTransition
            targetPhase={transitionTarget}
            onComplete={handleTransitionComplete}
          />
        )}

        {!transitioning && (
          <>
            {phase === "seed" && (
              <SeedPhase
                seedPrompt={unit.seedPrompt}
                seedHint={unit.seedHint}
                onSubmit={handleSeedSubmit}
              />
            )}

            {phase === "build" && (
              buildContent ? (
                <BuildPhase
                  buildContent={buildContent}
                  onComplete={handleBuildComplete}
                />
              ) : (
                <section className="border border-border bg-card p-6 text-sm text-muted-foreground">
                  Build content is not available yet.
                </section>
              )
            )}

            {phase === "practice" && (
              practicePrompts ? (
                <PracticePhase
                  practicePrompts={practicePrompts}
                  onSubmitPractice={handlePracticeSubmit}
                  onComplete={handlePracticeComplete}
                  preview={preview}
                  previewResults={preview ? previewPracticeResults : undefined}
                />
              ) : (
                <section className="border border-border bg-card p-6 text-sm text-muted-foreground">
                  Practice prompts are not available yet.
                </section>
              )
            )}

            {phase === "prove" && (
              <ProvePhase
                studentPersona={unit.teachbackSetup.studentPersona}
                openingMisconception={teachbackPrompt.studentMessage}
                startingRound={teachbackPrompt.round}
                onSubmitResponse={handleTeachbackSubmit}
                onComplete={handleProveComplete}
                preview={preview}
                previewTranscript={preview ? previewTeachbackTranscript : undefined}
                previewResult={preview ? previewTeachbackResult : undefined}
              />
            )}

            {phase === "isolation" && (
              <>
                {!failureIsolationData ? (
                  <section className="border border-border bg-card p-6 text-sm text-muted-foreground">
                    {failureIsolationQuery.isPending
                      ? "Isolating the failure..."
                      : failureIsolationQuery.error?.message ??
                        "Failure isolation is not available yet."}
                  </section>
                ) : (
                  <FailureIsolation
                    gap={failureIsolationData.gap}
                    ghostScenario={failureIsolationData.ghostScenario}
                    onSubmitGhost={handleGhostSubmit}
                    onRetryGhost={handleGhostRetry}
                    onComplete={handleIsolationComplete}
                    preview={preview}
                    isRefreshing={failureIsolationQuery.isFetching}
                  />
                )}
              </>
            )}

            {phase === "debrief" && (
              <>
                {!debriefData ? (
                  <section className="border border-border bg-card p-6 text-sm text-muted-foreground">
                    {debriefQuery.isPending
                      ? "Building the debrief..."
                      : debriefQuery.error?.message ??
                        "Debrief is not available yet."}
                  </section>
                ) : (
                  <UnitDebrief
                    debrief={debriefData}
                    onContinue={handleDebriefContinue}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
