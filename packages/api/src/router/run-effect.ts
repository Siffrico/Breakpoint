import { Cause, Effect, Exit } from "effect";

import type { ProfileNotFoundError } from "../domain/profile/errors";
import type { ProfileRepo } from "../domain/profile/profile-repo";
import type { MissionError } from "../domain/training/missions/mission-errors";
import type { MissionRepo } from "../domain/training/missions/mission-repo";
import type { DatabaseClient } from "../effect/db";
import type { DbError } from "../effect/errors";
import { translateMissionErrors } from "../effect/mission-edge";
import { translateProfileErrors } from "../effect/profile-edge";
import { missionLayer, profileLayer } from "../effect/runtime";

/**
 * The one way a tRPC procedure enters Effect's runtime.
 *
 * Four near-identical `run*` wrappers used to live in four `*-edge.ts` files,
 * each pairing these six lines with a different translation table. The tables
 * are worth keeping — they are the single place a domain failure becomes
 * learner-visible copy — but the plumbing around them was duplicated, so it
 * now lives here, inside the boundary the lint rule guards.
 *
 * `Cause.squash` is deliberate: a defect (an unexpected throw) must surface as
 * itself rather than be flattened into a declared failure, or a genuine bug
 * would reach the client wearing a domain error's message.
 */
export const runEffect = async <A>(
  effect: Effect.Effect<A, unknown>,
  options?: { readonly signal?: AbortSignal },
): Promise<A> => {
  const exit = await Effect.runPromiseExit(effect, options);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
};

/**
 * Mission procedures. The layer is composed here rather than at each call site
 * because every one of the five used the same `Effect.provide(missionLayer(ctx.db))`
 * suffix, and a procedure that forgot it failed only at runtime.
 */
export const runMission = <A>(
  client: DatabaseClient,
  effect: Effect.Effect<A, MissionError, MissionRepo>,
): Promise<A> =>
  runEffect(
    translateMissionErrors(effect.pipe(Effect.provide(missionLayer(client)))),
  );

/** Profile procedures. `client` is the request client or an open transaction. */
export const runProfile = <A>(
  client: DatabaseClient,
  effect: Effect.Effect<A, DbError | ProfileNotFoundError, ProfileRepo>,
): Promise<A> =>
  runEffect(
    translateProfileErrors(effect.pipe(Effect.provide(profileLayer(client)))),
  );
