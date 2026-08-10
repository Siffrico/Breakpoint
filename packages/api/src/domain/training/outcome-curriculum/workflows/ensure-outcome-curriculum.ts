import { Data, Effect } from "effect";

import type {
  DifficultyBand,
  PracticeContract,
  SkillMap,
} from "@acme/validators";

import type { ArtifactFailureKind } from "../../orchestration/agent-runtime";
import type { OutcomeCompilationOutput } from "../contracts";
import type { CompileOutcomeInput } from "../outcome-compiler";
import { deriveCanonicalDifficultyBands } from "../../engine/rating";
import { ARCHETYPE_FORMATS } from "../../engine/scenario-archetypes";

export class OutcomeNotFoundError extends Data.TaggedError(
  "OutcomeNotFoundError",
)<{ readonly outcomeNodeId: string; readonly message: string }> {}

export class OutcomeContextMissingError extends Data.TaggedError(
  "OutcomeContextMissingError",
)<{
  readonly outcomeNodeId: string;
  readonly field: "result" | "plan" | "identity";
  readonly message: string;
}> {}

export class OutcomeCompilationError extends Data.TaggedError(
  "OutcomeCompilationError",
)<{
  readonly kind: ArtifactFailureKind;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class OutcomePersistenceError extends Data.TaggedError(
  "OutcomePersistenceError",
)<{
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

interface OutcomeRecord {
  readonly id: string;
  readonly kind: string;
  readonly planId: string;
  readonly title: string;
  readonly outcomeResult: string | null;
  readonly skillMap: unknown;
  readonly practiceContract: unknown;
}

interface PlanRecord {
  readonly title: string;
  readonly summary: string;
  readonly targetIdentity: string;
  readonly profileVersionId: string | null;
  readonly onboardingSessionId: string;
}

interface ProfileRecord {
  readonly hardMoments: string[];
  readonly currentBaseline: string;
  readonly behaviorSignals: string[];
}

interface PriorPerformanceRecord {
  readonly title: string;
  readonly score: number;
  readonly failureTags: string[];
}

export interface EnsureOutcomeCurriculumDependencies<TKnowledge> {
  readonly loadOutcome: (
    outcomeNodeId: string,
  ) => Effect.Effect<OutcomeRecord | null, OutcomePersistenceError>;
  readonly listKnowledge: (
    outcomeNodeId: string,
  ) => Effect.Effect<TKnowledge[], OutcomePersistenceError>;
  readonly loadPlan: (
    planId: string,
  ) => Effect.Effect<PlanRecord | null, OutcomePersistenceError>;
  readonly loadProfile: (
    profileVersionId: string,
  ) => Effect.Effect<ProfileRecord | null, OutcomePersistenceError>;
  readonly listPriorPerformance: (
    sessionId: string,
  ) => Effect.Effect<PriorPerformanceRecord[], OutcomePersistenceError>;
  readonly compile: (
    input: CompileOutcomeInput,
  ) => Effect.Effect<OutcomeCompilationOutput, OutcomeCompilationError>;
  readonly persist: (input: {
    readonly outcomeNodeId: string;
    readonly skillMap: SkillMap;
    readonly practiceContract: PracticeContract;
    readonly difficultyBands: DifficultyBand[];
  }) => Effect.Effect<TKnowledge[], OutcomePersistenceError>;
}

export const ensureOutcomeCurriculumWorkflow = <TKnowledge>({
  outcomeNodeId,
  targetIdentity,
  abortSignal,
  deps,
}: {
  readonly outcomeNodeId: string;
  readonly targetIdentity?: string;
  readonly abortSignal?: AbortSignal;
  readonly deps: EnsureOutcomeCurriculumDependencies<TKnowledge>;
}): Effect.Effect<
  TKnowledge[],
  | OutcomeNotFoundError
  | OutcomeContextMissingError
  | OutcomeCompilationError
  | OutcomePersistenceError
> =>
  Effect.gen(function* () {
    const outcome = yield* deps.loadOutcome(outcomeNodeId);
    if (outcome?.kind !== "outcome") {
      return yield* new OutcomeNotFoundError({
        outcomeNodeId,
        message: "The outcome could not be found.",
      });
    }
    if (!outcome.outcomeResult) {
      return yield* new OutcomeContextMissingError({
        outcomeNodeId,
        field: "result",
        message: "The outcome is missing required curriculum data.",
      });
    }

    const existing = yield* deps.listKnowledge(outcomeNodeId);
    if (outcome.skillMap && outcome.practiceContract && existing.length > 0) {
      return existing;
    }

    const plan = yield* deps.loadPlan(outcome.planId);
    if (!plan) {
      return yield* new OutcomeContextMissingError({
        outcomeNodeId,
        field: "plan",
        message: "The outcome is missing required curriculum data.",
      });
    }
    const identity = targetIdentity ?? plan.targetIdentity;
    if (!identity) {
      return yield* new OutcomeContextMissingError({
        outcomeNodeId,
        field: "identity",
        message: "The outcome is missing required curriculum data.",
      });
    }

    const [profile, priorPerformance] = yield* Effect.all(
      [
        plan.profileVersionId
          ? deps.loadProfile(plan.profileVersionId)
          : Effect.succeed(null),
        deps.listPriorPerformance(plan.onboardingSessionId),
      ],
      { concurrency: 2 },
    );
    const compilation = yield* deps.compile({
      targetIdentity: identity,
      projectTitle: plan.title,
      projectSummary: plan.summary,
      outcomeTitle: outcome.title,
      outcomeResult: outcome.outcomeResult,
      learnerContext: {
        currentGap:
          profile?.hardMoments[0] ??
          profile?.currentBaseline ??
          "No specific current gap was recorded.",
        goodMeans:
          profile?.behaviorSignals && profile.behaviorSignals.length > 0
            ? profile.behaviorSignals
            : ["Accurate, domain-authentic performance."],
      },
      priorPerformance,
      options: { abortSignal },
    });
    const persisted = yield* deps.persist({
      outcomeNodeId,
      skillMap: compilation.skillMap,
      practiceContract: compilation.practiceContract,
      difficultyBands: [
        ...deriveCanonicalDifficultyBands(
          ARCHETYPE_FORMATS[compilation.practiceContract.responseMode],
        ),
      ],
    });
    if (persisted.length === 0) {
      return yield* new OutcomePersistenceError({
        operation: "persistOutcomeCurriculum",
        message: "The outcome curriculum could not be saved.",
      });
    }
    return persisted;
  });
