import { describe, expect, it } from "vitest";

import type { WorkspaceTurnRuntime } from "../workspace-ai/stage-runtime";
import type { WorkspaceAiMessage } from "../workspace-ai/types";
import { buildWorkspaceModelMessages } from "./build-messages";
import { WORKSPACE_CONTEXT_BUDGET } from "./context-budget";
import type { WorkspaceContextEnvelope } from "./schemas";

const envelope = {
  learner: {
    targetIdentity: "distributed systems engineer",
    durableMemory: [],
    recurringFailurePatterns: [],
    preferences: [],
    ratingSnapshot: null,
    progressSummary: null,
  },
  curriculum: { title: "Curriculum", summary: "Summary", currentUnitIndex: 1, totalUnits: 5 },
  unit: {
    title: "Unit",
    learningGoal: "Goal",
    summary: "Summary",
    whyItMatters: "Matters",
    seedScenario: "Scenario",
    focusAreas: [],
  },
  state: { mode: "education_unit", educationStage: "Diagnose", retryCount: 0 },
  evidence: {
    latestLearnerMessage: "hi",
    recentTranscript: [],
    mostRelevantFailure: null,
    strongestPriorSuccess: null,
    unresolvedPattern: null,
  },
  promptShownToLearner: null,
  evaluationPlan: null,
  attemptTiming: null,
  scenarioEvaluationContract: null,
  difficultyDirective: null,
  outputContract: {
    move: "diagnose",
    maxWords: 200,
    mustDo: [],
    mustNotDo: [],
  },
} as unknown as WorkspaceContextEnvelope;

const runtime = {
  mode: "education_unit",
  stage: "Diagnose",
  promptKind: "education_unit",
  modelPurpose: "education",
  contextMode: "teacher",
  contextMove: "diagnose",
  instruction: "Diagnose the learner.",
  verdictField: "diagnosisQuality",
} as unknown as WorkspaceTurnRuntime;

const message = (
  role: "user" | "assistant",
  content: string,
  sequence: number,
): WorkspaceAiMessage => ({
  role,
  content,
  sequence,
  slot: "education_unit",
  unitId: null,
  turnId: null,
});

describe("buildWorkspaceModelMessages", () => {
  it("puts one context message first, without a transcript section", () => {
    const result = buildWorkspaceModelMessages({
      envelope,
      runtime,
      messages: [message("user", "hello", 0)],
    });

    const contextMessage = result[0] as { role: string; content: string };
    expect(contextMessage.role).toBe("user");
    expect(contextMessage.content).not.toContain("## Recent transcript");
    expect(contextMessage.content).toContain("## Learner");
  });

  it("appends the real transcript as native messages, preserving roles and order", () => {
    const transcript = [
      message("user", "first", 0),
      message("assistant", "second", 1),
      message("user", "third", 2),
    ];

    const result = buildWorkspaceModelMessages({ envelope, runtime, messages: transcript });

    expect(result.slice(1)).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
      { role: "user", content: "third" },
    ]);
  });

  it("caps the transcript at the same budget selectWorkspaceEvidence() uses", () => {
    const transcript = Array.from({ length: 20 }, (_, i) =>
      message(i % 2 === 0 ? "user" : "assistant", `message-${i}`, i),
    );

    const result = buildWorkspaceModelMessages({ envelope, runtime, messages: transcript });

    expect(result.length - 1).toBe(WORKSPACE_CONTEXT_BUDGET.recentTranscriptMessages);
    expect(result.at(-1)).toEqual({ role: "assistant", content: "message-19" });
  });
});
