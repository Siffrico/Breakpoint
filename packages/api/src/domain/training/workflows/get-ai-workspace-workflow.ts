import type { Effect as EffectType } from "effect";
import { Cause, Effect, Exit } from "effect";

import type { DbError } from "../../../effect/errors";
import type { Result } from "../../../lib/result";
import type { ScenarioBrief } from "../education-unit/scenario-brief";
import type {
  CurriculumPlan,
  EducationUnitState,
} from "../types/training.types";
import type {
  WorkspaceAiMessage,
  WorkspaceAiState,
} from "../workspace-ai/types";
import type {
  AiWorkspaceReaderSource,
  WorkspaceProjectionReaderSource,
} from "../workspace-ai/workspace-reader";
import { err, ok } from "../../../lib/result";
import { projectScenarioBrief } from "../education-unit/scenario-brief";
import { getEducationUnitState } from "../policies/education-unit-state-policy";
import { planWorkspaceTurn } from "../workspace-ai/orchestrator";
import {
  CurriculumNotReadyError,
  NoRunnableWorkspaceTurnError,
} from "../workspace-ai/workspace-errors";
import {
  AiWorkspaceReader,
  makeAiWorkspaceReader,
  makeWorkspaceProjectionReader,
  WorkspaceProjectionReader,
} from "../workspace-ai/workspace-reader";
import {
  getUnitAdvanceGate,
  loadNextReadyUnitProjection,
} from "../workspace-ai/workspace-turn";

interface GetAiWorkspaceDependencies
  extends WorkspaceProjectionReaderSource,
    AiWorkspaceReaderSource {}

export interface AiWorkspaceView {
  plan: CurriculumPlan;
  unit: EducationUnitState;
  state: WorkspaceAiState;
  messages: WorkspaceAiMessage[];
  introMessage: {
    prompt: string;
    helper: string | null;
  } | null;
  unitAdvanceGate: ReturnType<typeof getUnitAdvanceGate>;
  scenario: ScenarioBrief | null;
}

export type { ScenarioBrief };

/**
 * Unit readiness is data, not an error: "preparing" is an expected state the
 * client polls through, so it travels in-band and error channels stay reserved
 * for genuine failures.
 */
export type AiWorkspaceResult =
  /**
   * `nodeId` is null between outcomes: the next outcome is still planned and
   * owns no unit node yet, so there is nothing for the client to poll by id.
   */
  | { kind: "preparing"; nodeId: string | null }
  | { kind: "ready"; workspace: AiWorkspaceView }
  | { kind: "complete"; plan: CurriculumPlan };

/**
 * Takes a learning session id; produces the current AI workspace view, or a
 * "preparing" marker while the active unit is still building, or a terminal
 * completion marker. A plan with neither an active unit nor completed outcomes
 * violates the progression invariant and fails instead of polling forever.
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
  DbError | CurriculumNotReadyError | NoRunnableWorkspaceTurnError,
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

    const active = yield* loadNextReadyUnitProjection({
      sessionId,
      nodes: plan.nodes,
    });
    if (active.node && !active.unit) {
      return { kind: "preparing", nodeId: active.node.id } as const;
    }

    if (!active.node) {
      const outcomeNodes = plan.nodes.filter((node) => node.kind === "outcome");
      // A plan that owns no outcomes at all is malformed — there is nothing
      // left to build and nothing to have completed.
      if (outcomeNodes.length === 0) {
        return yield* new NoRunnableWorkspaceTurnError({
          message: "The curriculum has no active unit.",
        });
      }
      return outcomeNodes.every((node) => node.status === "completed")
        ? ({ kind: "complete", plan } as const)
        : ({ kind: "preparing", nodeId: null } as const);
    }

    const state = planWorkspaceTurn({
      activeUnit: active.node,
      activeUnitResponses: active.responses,
      activeUnitRun: active.run,
      hasPersistedActiveUnitRun: active.hasPersistedRun,
      recallTarget: null,
    });
    if (!state || !active.unit || !active.run) {
      return yield* new NoRunnableWorkspaceTurnError({
        message: "The active unit could not be projected.",
      });
    }

    const activeUnitMessages = yield* displayReader.listUnitMessages(
      sessionId,
      active.node.id,
    );

    // Without this the stage is only ever delivered mid-stream, so a reload
    // during a settled pass left the learner with a locked composer and an
    // Enter that did nothing. The run's own list is the authority.
    const resolvedState = { ...state, educationStage: active.run.mode };

    // Each unit is its own chat. Earlier units live in the sidebar
    // as read-only history, not in the live scroll. Same precedence
    // findWorkspaceTurnNode uses to pick the unit messages are written under
    // (exactly one of the two is ever set — see orchestrator.ts), so this
    // matches the transcript the live turn appends to. With no runnable turn
    // there is no live chat to hydrate.
    const liveUnitId = resolvedState.activeUnitId;
    const messages = liveUnitId == null ? [] : activeUnitMessages;

    const activeNode = active.node;
    const nextLearningNode =
      plan.nodes
        .filter(
          (node) =>
            node.kind === "unit" && node.orderIndex > activeNode.orderIndex,
        )
        .sort((left, right) => left.orderIndex - right.orderIndex)[0] ?? null;

    return {
      kind: "ready",
      workspace: {
        plan,
        unit: getEducationUnitState({
          unit: active.unit,
          responses: active.responses,
        }),
        state: resolvedState,
        messages,
        unitAdvanceGate:
          resolvedState.recallUnitId != null
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
        scenario: projectScenarioBrief(active.run),
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
