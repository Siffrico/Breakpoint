import { Data } from "effect";

import type { DbError } from "../../../effect/errors";
import type { PhaseAgentError } from "../education-unit/agents/errors";
import type { EducationUnitContractError } from "../education-unit/orchestrate-unit-turn";

export class CurriculumNotReadyError extends Data.TaggedError(
  "CurriculumNotReadyError",
)<{
  readonly message: string;
}> {}

export class NoRunnableWorkspaceTurnError extends Data.TaggedError(
  "NoRunnableWorkspaceTurnError",
)<{
  readonly message: string;
}> {}

export class WorkspaceInputError extends Data.TaggedError(
  "WorkspaceInputError",
)<{
  readonly message: string;
}> {}

export class TurnLeaseConflictError extends Data.TaggedError(
  "TurnLeaseConflictError",
)<{
  readonly message: string;
}> {}

export class WorkspacePersistenceError extends Data.TaggedError(
  "WorkspacePersistenceError",
)<{
  readonly message: string;
  readonly operation: string;
  readonly cause?: unknown;
}> {}

export class RatingEvidenceError extends Data.TaggedError(
  "RatingEvidenceError",
)<{
  readonly message: string;
  readonly operation?: string;
  readonly cause?: unknown;
}> {}

export type InteractivePhaseAgentError = PhaseAgentError;

export type WorkspaceEducationTurnError =
  | WorkspaceInputError
  | TurnLeaseConflictError
  | WorkspacePersistenceError
  | DbError
  | RatingEvidenceError
  | InteractivePhaseAgentError
  | EducationUnitContractError;
