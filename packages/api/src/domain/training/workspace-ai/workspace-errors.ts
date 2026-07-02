import { Data } from "effect";

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
