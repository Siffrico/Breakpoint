import { Data } from "effect";

import type { DbError } from "../../../effect/errors";
import type { UnitAgentError } from "../education-unit/agent-errors";
import type { UnitTurnContractError } from "../education-unit/run-unit-turn";

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

export type InteractiveUnitAgentError = UnitAgentError;

export type WorkspaceEducationTurnError =
  | WorkspaceInputError
  | TurnLeaseConflictError
  | WorkspacePersistenceError
  | DbError
  | RatingEvidenceError
  | InteractiveUnitAgentError
  | UnitTurnContractError;
