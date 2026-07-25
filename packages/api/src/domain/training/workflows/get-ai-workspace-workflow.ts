import type { Effect as EffectType } from "effect";
import { Cause, Effect, Exit } from "effect";

import type { DbError } from "../../../effect/errors";
import type { Result } from "../../../lib/result";
import type { PersistedUnitRun } from "../education-unit/unit";
import type { CurriculumPlan } from "../types/training.types";
import type {
  EvaluationPlan,
  WorkspaceAiMessage,
  WorkspaceAiState,
} from "../workspace-ai/types";
import type {
  AiWorkspaceReaderSource,
  WorkspaceProjectionReaderSource,
} from "../workspace-ai/workspace-reader";
import { err, ok } from "../../../lib/result";
import { getEvaluationProgress } from "../workspace-ai/evaluation-plan";
import { planWorkspaceTurn } from "../workspace-ai/orchestrator";
import { CurriculumNotReadyError } from "../workspace-ai/workspace-errors";
import {
  AiWorkspaceReader,
  makeAiWorkspaceReader,
  makeWorkspaceProjectionReader,
  WorkspaceProjectionReader,
} from "../workspace-ai/workspace-reader";
import {
  getUnitAdvanceGate,
  loadNextReadyUnitProjection,
  loadPlannedRecall,
  resolveRecallRunProjection,
} from "../workspace-ai/workspace-turn";

interface GetAiWorkspaceDependencies
  extends WorkspaceProjectionReaderSource,
    AiWorkspaceReaderSource {}

export interface AiWorkspaceView {
  plan: CurriculumPlan;
  state: WorkspaceAiState | null;
  messages: WorkspaceAiMessage[];
  introMessage: {
    prompt: string;
    helper: string | null;
  } | null;
  evaluationPlan: EvaluationPlan | null;
  evaluationProgress: {
    completedAttempts: number;
    scenarioCount: number;
    attemptStartedAt: Date | null;
  } | null;
  unitAdvanceGate: ReturnType<typeof getUnitAdvanceGate>;
  scenario: ScenarioBrief | null;
}

export interface ScenarioBrief {
  stateA: string;
  stateB: string;
  frictionNoise: string | null;
}

/**
 * Unit readiness is data, not an error: "preparing" is an expected state the
 * client polls through, so it travels in-band and error channels stay reserved
 * for genuine failures.
 */
export type AiWorkspaceResult =
  | { kind: "preparing"; nodeId: string | null }
  | { kind: "ready"; workspace: AiWorkspaceView };

/**
 * Takes a learning session id; produces the current AI workspace view, or a
 * "preparing" marker while the active unit is still building; fails only when
 * the curriculum does not exist.
 *
 * Shares the send path's turn resolution (next-ready projection + planned
 * recall), so what the learner sees on load is exactly the turn a submit would
 * run. Every read is bounded: the plan, the active unit's rows, the recall
 * candidates, and one unit's transcript — never the whole session history.
 */
export const getAiWorkspaceWorkflowEffect = ({
  sessionId,
}: {
  sessionId: string;
}): EffectType.Effect<
  AiWorkspaceResult,
  DbError | CurriculumNotReadyError,
  WorkspaceProjectionReader | AiWorkspaceReader
> =>
  Effect.gen(function* () {
    const projectionReader = yield* WorkspaceProjectionReader;
    const displayReader = yield* AiWorkspaceReader;

    const plan = yield* projectionReader.getActivePlan(sessionId);
    if (!plan) {
      return yield* new CurriculumNotReadyError({
        message: "Curriculum is not ready yet.",
      });
    }

    const [active, inFlightRun] = yield* Effect.all(
      [
        loadNextReadyUnitProjection({ sessionId, nodes: plan.nodes }),
        projectionReader.getInFlightRecallRun(sessionId),
      ],
      { concurrency: 2 },
    );
    if (active.node && !active.unit) {
      return { kind: "preparing", nodeId: active.node.id } as const;
    }

    const activeScenarioAttemptId = active.responses
      .slice()
      .reverse()
      .find((response) => response.metadata?.scenarioAttemptId)
      ?.metadata?.scenarioAttemptId;

    // The active unit's transcript is fetched speculatively: it is the live
    // transcript unless a due recall wins below, and waiting for the recall
    // decision would serialize the common case behind it.
    const [plannedRecall, activeUnitMessages, attemptStartedAt] =
      yield* Effect.all(
        [
          loadPlannedRecall({
            sessionId,
            plan,
            active,
            inFlightRun,
            repairStaleRun: false,
          }),
          active.node
            ? displayReader.listUnitMessages(sessionId, active.node.id)
            : Effect.succeed<WorkspaceAiMessage[]>([]),
          active.unit && activeScenarioAttemptId
            ? displayReader.getScenarioAttemptStartedAt({
                scenarioAttemptId: activeScenarioAttemptId,
                nodeId: active.unit.nodeId,
              })
            : Effect.succeed(null),
        ],
        { concurrency: 3 },
      );

    const state = planWorkspaceTurn({
      nodes: plan.nodes,
      activeUnitResponses: active.responses,
      activeUnitRun: active.run,
      recallTarget: plannedRecall
        ? {
            unitNodeId: plannedRecall.node.id,
            unitTitle: plannedRecall.node.title,
          }
        : null,
    });

    // A recall interlude resumes the source unit's durable run cursor, exactly
    // as the send path resolves it — the view must report the same stage the
    // next submit will run.
    let resolvedState = state;
    // The run whose scenario is live: a recall interlude runs its own source
    // unit's cursor, so the active unit's run is not the one on screen.
    let resolvedRun: PersistedUnitRun | null = active.run;
    if (state?.recallUnitId) {
      const recallNode = plan.nodes.find(
        (node) => node.id === state.recallUnitId,
      );
      const recallUnit = recallNode
        ? yield* projectionReader.getUnitByNodeId(recallNode.id)
        : null;
      if (!recallUnit) {
        return { kind: "preparing", nodeId: recallNode?.id ?? null } as const;
      }
      const recallRun = resolveRecallRunProjection({
        sessionId,
        unit: recallUnit,
        existing: plannedRecall?.run ?? null,
      });
      resolvedRun = recallRun;
      resolvedState = {
        ...state,
        educationStage: recallRun.phase,
        workflowId: recallRun.recipeVersion,
      };
    }

    // Each unit is its own chat: show only the live unit's transcript (the
    // recall interlude, or the active unit). Earlier units live in the sidebar
    // as read-only history, not in the live scroll. Same precedence
    // findWorkspaceTurnNode uses to pick the unit messages are written under
    // (exactly one of the two is ever set — see orchestrator.ts), so this
    // matches the transcript the live turn appends to. With no runnable turn
    // there is no live chat to hydrate.
    const liveUnitId = resolvedState
      ? (resolvedState.activeUnitId ?? resolvedState.recallUnitId)
      : null;
    const messages =
      liveUnitId == null
        ? []
        : liveUnitId === active.node?.id
          ? activeUnitMessages
          : yield* displayReader.listUnitMessages(sessionId, liveUnitId);

    // Scenario-plan progress belongs to the active unit's education run; a
    // recall interlude is a single checkpoint with no plan to report.
    const isActiveUnitEducation =
      resolvedState?.mode === "education_unit" &&
      resolvedState.recallUnitId === null;
    const evaluationProgress = getEvaluationProgress(active.responses);
    const activeNode = active.node;
    const nextLearningNode =
      activeNode == null
        ? null
        : (plan.nodes.find(
            (node) =>
              node.kind === "unit" && node.orderIndex > activeNode.orderIndex,
          ) ?? null);

    return {
      kind: "ready",
      workspace: {
        plan,
        state: resolvedState,
        messages,
        evaluationPlan: isActiveUnitEducation
          ? evaluationProgress.latestPlan
          : null,
        evaluationProgress:
          isActiveUnitEducation && evaluationProgress.latestPlan
            ? {
                completedAttempts: evaluationProgress.completedAttempts,
                scenarioCount: evaluationProgress.latestPlan.scenarioCount,
                attemptStartedAt,
              }
            : null,
        unitAdvanceGate:
          resolvedState?.recallUnitId != null
            ? { status: "locked" }
            : getUnitAdvanceGate({
                node: active.node,
                run: active.run,
                nextNode: nextLearningNode,
              }),
        introMessage: buildWorkspaceIntroMessage({
          plan,
          state: resolvedState,
        }),
        scenario: projectScenarioBrief(resolvedRun),
      },
    } as const;
  });

export const getAiWorkspaceWorkflow = async ({
  sessionId,
  deps,
}: {
  sessionId: string;
  deps: GetAiWorkspaceDependencies;
}): Promise<Result<AiWorkspaceResult, string>> => {
  const exit = await Effect.runPromiseExit(
    getAiWorkspaceWorkflowEffect({ sessionId }).pipe(
      Effect.provideService(
        WorkspaceProjectionReader,
        makeWorkspaceProjectionReader(deps),
      ),
      Effect.provideService(AiWorkspaceReader, makeAiWorkspaceReader(deps)),
    ),
  );

  if (Exit.isSuccess(exit)) return ok(exit.value);

  const failure = Cause.squash(exit.cause);
  if (failure instanceof CurriculumNotReadyError) {
    return err(failure.message);
  }
  throw failure;
};

/**
 * Projects the run's recorded scenario spec down to the fields a learner may
 * see. Returns null whenever there is no scenario worth showing, which the
 * client reads as "render no scenario affordance at all".
 *
 * Two ways the spec is unshowable, both closed here rather than in the UI:
 *
 *   - It is STALE. The run's pass cursor advances at teach → connect, but the
 *     new round's spec is only recorded once Connect poses it. In that window
 *     `run.pass` is already N+1 while the stored spec is still tagged N, and
 *     that spec describes the scenario the learner just finished. Requiring the
 *     tags to agree means a lagging spec is simply not shown — and the gap is
 *     harmless, because during it the freshly posed scenario is still the
 *     on-screen active prompt. (An untagged spec predates the tag: it is pass
 *     one's, per the same convention the context builder uses.)
 *
 *   - It is PRE-V2. `stateA`/`stateB` are optional only so specs persisted
 *     before the A→B shape still parse. Without both there is no scenario to
 *     state, and half a panel is worse than none, so those rows get no brief.
 *
 * Fields are copied one by one, never spread: the same object carries
 * `canonicalAnswer`, `reasoningPath`, `rubric` and `correctLetter`, and a
 * spread would ship the answer key to the browser the moment a field is added.
 */
export const projectScenarioBrief = (
  run: PersistedUnitRun | null,
): ScenarioBrief | null => {
  const spec = run?.scenarioSpec;
  if (!run || !spec) return null;
  if ((spec.pass ?? 1) !== run.pass) return null;
  if (!spec.stateA || !spec.stateB) return null;

  return {
    stateA: spec.stateA,
    stateB: spec.stateB,
    frictionNoise: spec.frictionNoise ?? null,
  };
};

export const buildWorkspaceIntroMessage = ({
  plan,
  state,
}: {
  plan: CurriculumPlan;
  state: WorkspaceAiState | null;
}) => {
  if (!state?.recallUnitId) {
    return null;
  }

  const recallUnit = plan.nodes.find((node) => node.id === state.recallUnitId);
  if (!recallUnit) {
    return null;
  }

  return {
    helper: "Recall",
    prompt: `Return to ${recallUnit.title}. Reconstruct the key distinction, mechanism, or procedure from memory before you move on.`,
  };
};
