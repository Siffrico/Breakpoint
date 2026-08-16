import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import type {
  UnitDifficultySnapshot,
  UnitReviewChallenge,
} from "@acme/validators";

import type {
  CurriculumNode,
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type { WorkspaceAiMessage } from "./types";
import type { WorkspaceEducationTurnCommit } from "./workspace-turn-persistence";
import { DEFAULT_EDUCATION_EXPERIENCE } from "../education-unit/experience";
import { makeUnitContext } from "../education-unit/unit-context.fixture";
import { createUnitRun } from "../education-unit/unit-state";
import { saveUnitTurnResult } from "./workspace-turn-persistence";
import { WorkspaceTurnRepo } from "./workspace-turn-repo";

const unitContext = makeUnitContext({
  criterionId: "stable-boundaries",
  criterion: "Keep responsibility at the canonical boundary.",
});

const difficultySnapshot = {
  nodeId: "node-recall",
  directive: {
    intent: "probe",
    bandOrder: 0,
    supportLevel: "none",
    targetItemRating: 1200,
    targetMisconceptionCode: null,
    reason: "Probe durable recall.",
    nextProgress: { bandOrder: 0, supportLevel: "none" },
  },
  promptBlock: "Probe durable recall.",
  ratingSnapshot: "rating snapshot",
  learnerRating: 1200,
  format: {
    id: "frq",
    label: "Free response",
    kind: "frq",
    description: "Explain the decision.",
  },
} satisfies UnitDifficultySnapshot;

const challenge = {
  prompt: "A production constraint changed. Choose and defend the next move.",
  difficultyVector: {
    formatId: "frq",
    reasoningPathSteps: 3,
    withheldGivens: 1,
    embeddedAlternatives: 2,
  },
  contract: {
    version: 1,
    runKind: "recall",
    scenarioPromptSummary: "Choose under the changed constraint.",
    testedCriterionIds: ["stable-boundaries"],
  },
} satisfies UnitReviewChallenge;

const recallNode = {
  id: "node-recall",
  parentNodeId: "skill-1",
  kind: "unit",
  title: "Completed unit",
  summary: "Summary",
  whyItMatters: "Why",
  learningGoal: "Goal",
  orderIndex: 0,
  depth: 1,
  positionColumn: 0,
  positionRow: 0,
  status: "completed",
  difficultyBands: null,
} satisfies CurriculumNode;

const activeNode = {
  ...recallNode,
  id: "node-active",
  title: "Next unit",
  orderIndex: 1,
  status: "ready",
} satisfies CurriculumNode;

const unitStateFields = {
  title: "Stable boundaries",
  summary: "Keep one canonical boundary.",
  whyItMatters: "Duplicated ownership creates divergent behavior.",
  learningGoal: "Choose and defend the canonical boundary.",
  buildContent:
    "**Heuristic** Re-derive the move when the controlling constraint changes. **Worked example** **Read** A deploy slows after one configuration change. **Predict** The change may invalidate the usual fix. **Compare** Restarting hides the cause; isolating the changed input tests it. **Decide** Test the changed input first. How would you explain this heuristic in your own words?",
  seedPrompt: "Diagnose the failure and justify the next probe.",
  seedHint: "Name the controlling evidence.",
  clusterArcFrame: null,
  clusterBriefing: null,
  scenario: { title: "A changed boundary", focusAreas: ["ownership"] },
};

const recallUnit = {
  ...unitStateFields,
  id: "unit-recall",
  nodeId: recallNode.id,
  unitContext,
} as UnitContent;

const activeUnit = {
  ...unitStateFields,
  id: "unit-active",
  nodeId: activeNode.id,
  unitContext,
} as UnitContent;

const recallCandidate = {
  id: "knowledge-1",
  questionId: "question-1",
  skillNodeId: "skill-1",
  questionOrderIndex: 0,
  label: "Stable boundaries",
  content: "Keep responsibility at the canonical boundary.",
  checkedAt: new Date("2026-01-01T00:00:00Z"),
  strength: 0,
  lastReinforcedAt: new Date("2026-01-01T00:00:00Z"),
  evidenceNodeId: recallNode.id,
  orderIndex: 0,
};

describe("saveUnitTurnResult", () => {
  it("persists the recall target needed to resume the in-flight review", async () => {
    const recallRun = {
      ...createUnitRun({
        unitId: recallUnit.id,
        sessionId: "session-1",
        userId: "user-1",
        kind: "recall",
        unitContext,
        experience: DEFAULT_EDUCATION_EXPERIENCE,
      }),
      difficultySnapshot,
      activeReviewChallenge: challenge,
    };
    const activeRun = {
      ...createUnitRun({
        unitId: activeUnit.id,
        sessionId: "session-1",
        userId: "user-1",
        kind: "education",
        unitContext,
        experience: DEFAULT_EDUCATION_EXPERIENCE,
      }),
      mode: "complete" as const,
    };
    const phaseResponses: PhaseResponseRecord[] = [];
    const commits: WorkspaceEducationTurnCommit[] = [];
    const assistantMessage: WorkspaceAiMessage = {
      role: "assistant",
      content: challenge.prompt,
      sequence: 1,
      slot: "education_unit",
      unitId: recallNode.id,
      turnId: "turn-1",
      metadata: null,
    };

    const result = await Effect.runPromise(
      saveUnitTurnResult({
        sessionId: "session-1",
        userId: "user-1",
        message: "Start recall",
        unit: recallUnit,
        plan: {
          id: "plan-1",
          nodes: [recallNode, activeNode],
        } as CurriculumPlan,
        turnResult: {
          assistantMessage: challenge.prompt,
          nextRun: recallRun,
          actor: "reviewer",
          reviewGrade: null,
          ratingWrite: null,
          presentedReviewChallenge: true,
        },
        ratingEvaluation: null,
        tracksRating: true,
        recallEntryIds: [recallCandidate.id],
        difficultySnapshot,
        turnId: "turn-1",
        turnLeaseId: "lease-1",
        persistUserMessage: true,
        responseSequence: 0,
        deps: {
          claimWorkspaceTurn: () =>
            Promise.resolve({
              status: "claimed" as const,
              claimedAt: new Date(),
            }),
          appendMessage: () => Promise.resolve(assistantMessage),
          listUnitMessages: () => Promise.resolve([assistantMessage]),
          markWorkspaceTurnFailed: () => Promise.resolve(),
          claimWorkspaceUnitLease: () => Promise.resolve(true),
          releaseWorkspaceUnitLease: () => Promise.resolve(),
          getPhaseResponses: (unitContentId) =>
            Promise.resolve(
              unitContentId === recallUnit.id ? phaseResponses : [],
            ),
          getUnitRun: (_sessionId, unitContentId) =>
            Promise.resolve(unitContentId === activeUnit.id ? activeRun : null),
          getInFlightRecallRun: () => Promise.resolve(recallRun),
          retireInFlightRecallRun: () => Promise.resolve(),
          getUnitByNodeId: (nodeId) =>
            Promise.resolve(nodeId === recallNode.id ? recallUnit : activeUnit),
          getRecallCandidatesByIds: () => Promise.resolve([recallCandidate]),
          getMostOverdueRecallCandidate: () => Promise.resolve(null),
          getRecallCompanionCandidate: () => Promise.resolve(null),
        },
      }).pipe(
        Effect.provide(
          Layer.succeed(WorkspaceTurnRepo, {
            commitEducationTurn: (input) =>
              Effect.sync(() => {
                if (!input.phaseResponse) {
                  throw new Error("Expected a learner phase response.");
                }
                commits.push(input);
                phaseResponses.push({
                  id: "response-1",
                  unitContentId: input.phaseResponse.unitContentId,
                  sessionId: input.phaseResponse.sessionId,
                  userId: input.phaseResponse.userId,
                  phase: input.phaseResponse.phase,
                  sequence: input.phaseResponse.sequence ?? 0,
                  userResponse: input.phaseResponse.userResponse,
                  aiResponse: input.phaseResponse.aiResponse ?? null,
                  passed: input.phaseResponse.passed ?? null,
                  score: input.phaseResponse.score ?? null,
                  metadata: input.phaseResponse.metadata ?? null,
                  createdAt: new Date(),
                });
                return { assistantMessage };
              }),
          }),
        ),
      ),
    );

    expect(commits[0]?.phaseResponse?.metadata?.recallEntryIds).toEqual([
      recallCandidate.id,
    ]);
    expect(result.state).toMatchObject({
      promptKind: "recall",
      recallUnitId: recallNode.id,
    });
  });
});
