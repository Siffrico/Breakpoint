import { Layer } from "effect";

import type { DatabaseClient } from "./db";
import { MissionRepoLive } from "../repositories/mission-repository";
import { PerformanceRepoLive } from "../repositories/performance-repository";
import { ProfileRepoLive } from "../repositories/profile-repository";
import { Db } from "./db";

/** Compose the profile adapter with the current request or transaction client. */
export const profileLayer = (client: DatabaseClient) =>
  ProfileRepoLive.pipe(Layer.provide(Layer.succeed(Db, { client })));

/** Compose the mission adapter with the current request or transaction client. */
export const missionLayer = (client: DatabaseClient) =>
  MissionRepoLive.pipe(Layer.provide(Layer.succeed(Db, { client })));

export const performanceLayer = (client: DatabaseClient) =>
  PerformanceRepoLive.pipe(Layer.provide(Layer.succeed(Db, { client })));
