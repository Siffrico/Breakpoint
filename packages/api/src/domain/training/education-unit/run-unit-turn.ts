import { Effect } from "effect";

import type {
  EvaluationDimensionResult,
  UnitPartResult,
  WorkspaceTurnAction,
} from "@acme/validators";

import type { Memory } from "../../memory/types";
import type { ReviewGradeOutput } from "./agent-contracts";
import type { UnitAgentError } from "./agent-errors";
import type { DraftDependencies } from "./draft-step";
import type { EducationExperienceDefinition } from "./experience";
import type { PersistedUnitRun } from "./unit-state";
import { renderGradeMessage, renderLabeledPart } from "./agent-contracts";
import {
  difficultyVectorFor,
  draftLesson,
  draftParts,
  LIVE_DRAFT_DEPENDENCIES,
  UnitTurnContractError,
} from "./draft-step";
import { runReviewGradeAgent } from "./review-agent";
import { createGradingContext } from "./unit-context";
import {
  activeRound,
  assertInteractionId,
  nextUnitMove,
  openParts,
  partLetter,
  recordExplanation,
  recordLesson,
  recordPartAdded,
  recordPartResults,
  recordRoundOpened,
  takePreparedDraft,
  waitingFor,
} from "./unit-state";

export { UnitTurnContractError } from "./draft-step";

export interface UnitTurnResult {
  readonly assistantMessage: string;
  readonly nextRun: PersistedUnitRun;
  readonly actor: "mentor" | "reviewer";
  /** Set on a turn that graded parts. */
  readonly grade: {
    readonly checksMet: number;
    readonly checksTotal: number;
    readonly errorCodes: readonly string[];
    readonly reasoning: string;
    readonly criterionResults: readonly EvaluationDimensionResult[];
    readonly passed: boolean;
  } | null;
  /** Set on a turn that graded a rated round. */
  readonly ratingWrite: {
    readonly checksMet: number;
    readonly checksTotal: number;
    readonly errorCodes: readonly string[];
    readonly presentedAt: Date;
    readonly partCount: number;
  } | null;
  /** True when this turn put a rated round on the board. */
  readonly presentedRatedRound: boolean;
}

export interface UnitTurnDependencies extends DraftDependencies {
  readonly runReviewGrade: typeof runReviewGradeAgent;
}

const LIVE_DEPENDENCIES: UnitTurnDependencies = {
  ...LIVE_DRAFT_DEPENDENCIES,
  runReviewGrade: runReviewGradeAgent,
};

interface TurnInput {
  readonly run: PersistedUnitRun;
  readonly experience: EducationExperienceDefinition;
  readonly memories: readonly Memory[];
  readonly onPartialAssistantMessage?: (content: string) => void;
}

const contractFailure = (message: string) =>
  Effect.fail(new UnitTurnContractError({ message }));

const asTurnError = Effect.mapError(
  (error: { readonly message: string }) =>
    new UnitTurnContractError({ message: error.message }),
);

const joinBlocks = (blocks: readonly (string | null)[]) =>
  blocks.filter((block): block is string => Boolean(block)).join("\n\n");

const mentorResult = (
  assistantMessage: string,
  nextRun: PersistedUnitRun,
  presentedRatedRound = false,
): UnitTurnResult => ({
  assistantMessage,
  nextRun,
  actor: "mentor",
  grade: null,
  ratingWrite: null,
  presentedRatedRound,
});

/** Carries out the unit policy's next move. */
const perform = (
  input: TurnInput & { readonly acknowledgesExplanation: boolean },
  deps: UnitTurnDependencies,
): Effect.Effect<UnitTurnResult, UnitAgentError | UnitTurnContractError> =>
  Effect.gen(function* () {
    const { run, onPartialAssistantMessage } = input;
    const move = nextUnitMove(run);
    switch (move.kind) {
      case "complete":
        return yield* contractFailure("The unit has already been decided.");
      case "teach": {
        const prepared = takePreparedDraft(run.cursor, "lesson");
        if (prepared) onPartialAssistantMessage?.(prepared.lesson);
        const lesson =
          prepared?.lesson ?? (yield* draftLesson(input, deps));
        return mentorResult(
          lesson,
          yield* recordLesson(run, lesson).pipe(asTurnError),
        );
      }
      case "open_round":
      case "next_part": {
        // An acknowledgment answers what the learner just wrote, so it can
        // never have been prepared ahead of them.
        const preparedParts = input.acknowledgesExplanation
          ? null
          : takePreparedDraft(run.cursor, "parts");
        const prepared =
          preparedParts &&
          (preparedParts.narrative !== null) === (move.kind === "open_round")
            ? preparedParts
            : null;
        const firstLetter = activeRound(run.cursor)?.parts.length ?? 0;
        const draft = prepared
          ? {
              acknowledgment: null,
              narrative: prepared.narrative,
              parts: prepared.parts,
              letters: prepared.parts.map((_, index) =>
                partLetter(move.kind === "open_round" ? index : firstLetter + index),
              ),
            }
          : yield* draftParts(
              {
                run,
                move,
                experience: input.experience,
                acknowledgesExplanation: input.acknowledgesExplanation,
                onPartialAssistantMessage,
              },
              deps,
            );
        const message = joinBlocks([
          draft.acknowledgment,
          draft.narrative,
          ...draft.parts.map((part, index) =>
            renderLabeledPart(draft.letters[index] ?? "", part.question),
          ),
        ]);
        if (prepared) onPartialAssistantMessage?.(message);
        const presentedAt = new Date();
        if (move.kind === "next_part") {
          const [part] = draft.parts;
          if (!part || draft.parts.length !== 1) {
            return yield* contractFailure("The next part was not written.");
          }
          return mentorResult(
            message,
            yield* recordPartAdded({ run, part, presentedAt }).pipe(
              asTurnError,
            ),
          );
        }
        if (!draft.narrative) {
          return yield* contractFailure("A new round needs its situation.");
        }
        const nextRun = yield* recordRoundOpened({
          run,
          spec: move.spec,
          narrative: draft.narrative,
          difficultyVector: yield* difficultyVectorFor(run),
          parts: draft.parts,
          presentedAt,
        }).pipe(asTurnError);
        return mentorResult(message, nextRun, move.spec.rated);
      }
    }
  });

const NO_ANSWER_EVIDENCE = "No answer to this part.";

const toPartResult = (output: ReviewGradeOutput): UnitPartResult => {
  const criterionResults = output.dimensionResults.map((result) => ({
    dimensionId: result.dimensionId,
    met: result.met,
    evidence: result.evidence ?? NO_ANSWER_EVIDENCE,
    missing: result.missing,
  }));
  const met = criterionResults.every((result) => result.met);
  return {
    met,
    criterionResults,
    feedback: renderGradeMessage(output),
    hypothesis: met ? null : (output.diagnosis?.hypothesis ?? null),
    causeType: met ? null : output.causeType,
    errorCodes: met ? [] : output.errorCodes,
  };
};

/** One part's feedback alone; several parts get labels and a score. */
const renderFeedback = (
  letters: readonly string[],
  feedback: readonly string[],
  score: { met: number; total: number } | null,
): string =>
  letters.length === 1
    ? (feedback[0] ?? "")
    : joinBlocks([
        score ? `**Score:** ${score.met} of ${score.total} parts` : null,
        ...letters.map((letter, index) =>
          feedback[index] ? renderLabeledPart(letter, feedback[index]) : null,
        ),
      ]);

const gradeOpenParts = (
  input: TurnInput & { readonly learnerAnswer: string },
  deps: UnitTurnDependencies,
): Effect.Effect<UnitTurnResult, UnitAgentError | UnitTurnContractError> =>
  Effect.gen(function* () {
    const { run, learnerAnswer, onPartialAssistantMessage } = input;
    const round = activeRound(run.cursor);
    const parts = openParts(run.cursor);
    if (!round || parts.length === 0) {
      return yield* contractFailure("There are no open parts to grade.");
    }
    const firstIndex = round.parts.length - parts.length;
    const letters = parts.map((_, index) => partLetter(firstIndex + index));
    const context = createGradingContext({
      unitContext: run.unitContext,
      steps: run.cursor.steps,
    });
    const streamed = parts.map(() => "");
    const finished = parts.map(() => false);
    // Streamed text can only be appended to, so the learner sees parts in
    // order: every finished part, then the first unfinished one. A later part
    // that grades first waits its turn.
    const streamInOrder = () => {
      const firstOpen = finished.indexOf(false);
      onPartialAssistantMessage?.(
        renderFeedback(
          letters,
          firstOpen === -1 ? streamed : streamed.slice(0, firstOpen + 1),
          null,
        ),
      );
    };
    // Each part is graded by its own critic so a strong answer to one part
    // cannot lift the grade of another. They run side by side, so the wait is
    // one grade long.
    const outputs = yield* Effect.all(
      parts.map((part, index) =>
        deps
          .runReviewGrade({
            learnerAnswer,
            context,
            part,
            letter: letters[index] ?? "",
            answersSeveralParts: parts.length > 1,
            experience: input.experience,
            priorErrorCodes: run.cursor.errorCodeHistory,
            onPartialAssistantMessage: onPartialAssistantMessage
              ? (content) => {
                  streamed[index] = content;
                  streamInOrder();
                }
              : undefined,
          })
          .pipe(
            Effect.map(({ object }) => object),
            Effect.tap(() =>
              Effect.sync(() => {
                finished[index] = true;
                streamInOrder();
              }),
            ),
          ),
      ),
      { concurrency: "unbounded" },
    );
    const results = outputs.map(toPartResult);
    const nextRun = yield* recordPartResults(run, results).pipe(asTurnError);
    const criterionResults = results.flatMap(
      (result) => result.criterionResults,
    );
    const checksMet = criterionResults.filter((result) => result.met).length;
    const errorCodes = [
      ...new Set(results.flatMap((result) => result.errorCodes)),
    ];
    const metParts = results.filter((result) => result.met).length;
    return {
      assistantMessage: renderFeedback(
        letters,
        results.map((result) => result.feedback),
        { met: metParts, total: results.length },
      ),
      nextRun,
      actor: "reviewer" as const,
      grade: {
        checksMet,
        checksTotal: criterionResults.length,
        errorCodes,
        reasoning: outputs.map((output) => output.scratchpad).join("\n\n"),
        criterionResults,
        passed: metParts === results.length,
      },
      ratingWrite: round.spec.rated
        ? {
            checksMet,
            checksTotal: criterionResults.length,
            errorCodes,
            presentedAt: new Date(parts[0]?.presentedAt ?? Date.now()),
            partCount: parts.length,
          }
        : null,
      presentedRatedRound: false,
    };
  });

export const runUnitTurn = (
  {
    run,
    interactionId,
    action,
    learnerMessage,
    experience,
    memories,
    onPartialAssistantMessage,
  }: {
    run: PersistedUnitRun;
    interactionId: string;
    action: WorkspaceTurnAction;
    learnerMessage: string;
    experience: EducationExperienceDefinition;
    memories: readonly Memory[];
    onPartialAssistantMessage?: (content: string) => void;
  },
  deps: UnitTurnDependencies = LIVE_DEPENDENCIES,
): Effect.Effect<UnitTurnResult, UnitAgentError | UnitTurnContractError> =>
  Effect.gen(function* () {
    yield* assertInteractionId(run, interactionId).pipe(asTurnError);
    const input = { run, experience, memories, onPartialAssistantMessage };
    const answer = learnerMessage.trim();
    const wait = waitingFor(run.cursor);
    switch (wait) {
      case "done":
        return yield* contractFailure("The education unit is already complete.");
      case "start":
        if (action !== "start_unit") {
          return yield* contractFailure("Start the unit to begin.");
        }
        return yield* perform({ ...input, acknowledgesExplanation: false }, deps);
      case "explanation": {
        if (action !== "submit_answer" || !answer) {
          return yield* contractFailure("Explain the lesson back to continue.");
        }
        const explained = yield* recordExplanation(run, answer).pipe(
          asTurnError,
        );
        return yield* perform(
          { ...input, run: explained, acknowledgesExplanation: true },
          deps,
        );
      }
      case "answer":
        if (action !== "submit_answer" || !answer) {
          return yield* contractFailure("Answer the open parts to continue.");
        }
        return yield* gradeOpenParts({ ...input, learnerAnswer: answer }, deps);
      case "continue":
        if (action !== "continue") {
          return yield* contractFailure("Press Continue to go on.");
        }
        return yield* perform({ ...input, acknowledgesExplanation: false }, deps);
    }
  });
