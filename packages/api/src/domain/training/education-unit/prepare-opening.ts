import { createHash } from "node:crypto";
import { Cause, Data, Effect, Exit } from "effect";

import type { UnitCursor } from "@acme/validators";

import type { runMentorTeachingAgent } from "./mentor-agent";

export type PreparedOpening = NonNullable<UnitCursor["preparedOpening"]>;
export type OpeningTeachingInput = Omit<
  Parameters<typeof runMentorTeachingAgent>[0],
  "messages" | "createScenario"
>;

export class UnitOpeningError extends Data.TaggedError("UnitOpeningError")<{
  readonly kind: "storage" | "generation";
  readonly message: string;
  readonly cause: unknown;
}> {}

export type OpeningLookup =
  | { kind: "unopened"; opening: PreparedOpening | null }
  | { kind: "started" };

export interface OpeningPreparationDependencies {
  load: () => Promise<OpeningLookup>;
  withLock: (
    build: (
      save: (opening: PreparedOpening) => Promise<void>,
    ) => Promise<PreparedOpening | null>,
    loadReady: () => Promise<PreparedOpening | null>,
  ) => Promise<PreparedOpening | null>;
  teach: typeof runMentorTeachingAgent;
}

export const prepareOpening = (
  input: OpeningTeachingInput,
  deps: OpeningPreparationDependencies,
): Effect.Effect<string | null, UnitOpeningError> =>
  Effect.tryPromise({
    try: async () => {
      const { onPartialAssistantMessage, ...contentInput } = input;
      const key = createHash("sha256")
        .update(JSON.stringify(contentInput))
        .digest("hex");
      const existing = await deps.load();
      if (existing.kind === "started") return null;
      if (existing.opening?.key === key)
        return existing.opening.assistantMessage;

      for (;;) {
        const opening = await deps.withLock(
          async (save) => {
            const cached = await deps.load();
            if (cached.kind === "started") return null;
            if (cached.opening?.key === key) return cached.opening;
            // eslint-disable-next-line no-restricted-syntax -- This model invocation runs inside the durable build lease.
            const generated = await Effect.runPromiseExit(
              deps.teach({
                ...input,
                messages: [],
                createScenario: false,
                onPartialAssistantMessage,
              }),
            );
            if (Exit.isFailure(generated)) {
              throw new UnitOpeningError({
                kind: "generation",
                message:
                  "Your introduction could not be prepared. Please retry.",
                cause: Cause.squash(generated.cause),
              });
            }
            const prepared = {
              key,
              assistantMessage: generated.value.object.assistantMessage,
            };
            await save(prepared);
            return prepared;
          },
          async () => {
            const current = await deps.load();
            return current.kind === "unopened" ? current.opening : null;
          },
        );
        if (!opening) return null;
        if (opening.key === key) return opening.assistantMessage;
      }
    },
    catch: (cause) =>
      cause instanceof UnitOpeningError
        ? cause
        : new UnitOpeningError({
            kind: "storage",
            message: "Your introduction could not be loaded. Please retry.",
            cause,
          }),
  });
