"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";

import type {
  DebriefPreviewResult,
  RetrievalPreviewResult,
  UnitPreviewState,
} from "~/features/training/lib/training-preview";
import {
  previewDebriefResult,
  previewRetrievalResult,
} from "~/features/training/lib/training-preview";

export function UnitWorkspace({
  unit,
  sessionId,
}: {
  unit: UnitPreviewState;
  sessionId: string;
}) {
  const [answers, setAnswers] = useState(["", "", ""]);
  const [retrievalResult, setRetrievalResult] =
    useState<RetrievalPreviewResult | null>(null);
  const [debrief, setDebrief] = useState<DebriefPreviewResult | null>(null);
  const [response, setResponse] = useState("");

  const canOpenScenario = retrievalResult?.passed ?? false;
  const workspaceHref = `/ui/workspace?session=${sessionId}`;

  return (
    <main className="min-h-screen bg-[#06070a] px-5 py-8 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between border-b border-white/8 pb-6">
          <div>
            <h1 className="font-display mt-3 text-4xl tracking-[-0.06em] sm:text-5xl">
              {unit.title}
            </h1>
          </div>
          <Button
            asChild
            variant="outline"
            className="h-11 rounded-none border-white/15 bg-transparent px-5 text-white hover:bg-white/5 hover:text-white"
          >
            <Link href={workspaceHref}>Workspace</Link>
          </Button>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="border border-white/10 bg-white/[0.03] p-6">
            <p className="mt-4 text-base leading-8 text-white/72">{unit.concept}</p>
          </section>

          <section className="border border-white/10 bg-white/[0.03] p-6">
            <p className="mt-4 text-base leading-8 text-white/72">
              {unit.workedExample}
            </p>
          </section>
        </div>

        <section className="border border-white/10 bg-white/[0.03] p-6">
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {unit.retrievalItems.map((item, index) => (
              <div key={item.prompt} className="border border-white/8 bg-black/20 p-4">
                <div className="text-sm leading-7 text-white/70">{item.prompt}</div>
                <Textarea
                  value={answers[index] ?? ""}
                  onChange={(event) =>
                    setAnswers((current) =>
                      current.map((answer, answerIndex) =>
                        answerIndex === index ? event.target.value : answer,
                      ),
                    )
                  }
                  className="mt-4 min-h-28 rounded-none border-white/10 bg-transparent px-3 py-3 text-sm text-white shadow-none focus-visible:ring-0"
                />
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => setRetrievalResult(previewRetrievalResult)}
              className="h-11 rounded-none bg-white px-5 text-black hover:bg-white/90"
            >
              Check retrieval
            </Button>

            {retrievalResult ? (
              <div className="text-sm text-white/60">
                Score {retrievalResult.score} / {retrievalResult.passed ? "Scenario unlocked" : "Retry required"}
              </div>
            ) : null}
          </div>

          {retrievalResult ? (
            <div className="mt-4 space-y-3">
              {retrievalResult.feedback.map((item) => (
                <div key={item} className="border border-white/8 px-4 py-3 text-sm text-white/68">
                  {item}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-display mt-3 text-3xl tracking-[-0.05em]">
            {unit.scenario.title}
          </h2>
          <p className="mt-4 max-w-4xl text-base leading-8 text-white/68">
            {unit.scenario.prompt}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {unit.scenario.focusAreas.map((area) => (
              <div
                key={area}
                className="border border-white/8 px-3 py-2 text-[10px] tracking-[0.24em] uppercase text-white/45"
              >
                {area}
              </div>
            ))}
          </div>

          <Textarea
            value={response}
            onChange={(event) => setResponse(event.target.value)}
            disabled={!canOpenScenario}
            placeholder={
              canOpenScenario
                ? "Explain what is happening, your first move, how you contain it, and how you verify it."
                : "Pass retrieval first to unlock the scenario."
            }
            className="mt-6 min-h-[220px] rounded-none border-white/10 bg-transparent px-4 py-4 text-base leading-8 text-white shadow-none focus-visible:ring-0"
          />

          <div className="mt-5 flex items-center justify-between gap-4">
            <div className="text-sm text-white/45">
              Strong answers are specific, decisive, and verifiable.
            </div>
            <Button
              type="button"
              disabled={!canOpenScenario || response.trim().length < 120}
              onClick={() => setDebrief(previewDebriefResult)}
              className="h-11 rounded-none bg-white px-5 text-black hover:bg-white/90"
            >
              Submit scenario
            </Button>
          </div>
        </section>

        {debrief ? (
          <section className="border border-white/10 bg-white/[0.03] p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display mt-3 text-4xl tracking-[-0.05em]">
                  {debrief.score}
                </h2>
              </div>
              <div className="text-sm text-white/55">
                {debrief.readiness.replaceAll("_", " ")}
              </div>
            </div>

            <p className="mt-5 max-w-4xl text-base leading-8 text-white/68">
              {debrief.targetComparison}
            </p>

            <div className="mt-6 grid gap-5 lg:grid-cols-3">
              <div className="border border-white/8 p-4">
                <div className="mt-3 space-y-3 text-sm leading-7 text-white/68">
                  {debrief.strengths.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>

              <div className="border border-white/8 p-4">
                <div className="mt-3 space-y-3 text-sm leading-7 text-white/68">
                  {debrief.improvements.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>

              <div className="border border-white/8 p-4">
                <div className="mt-3 space-y-3 text-sm leading-7 text-white/68">
                  {debrief.failureTags.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
                <div className="mt-4 text-sm leading-7 text-white/55">
                  {debrief.nextStep}
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
