import type { MissionStatus } from "@acme/validators";

export type MissionTransition = "start" | "complete" | "skip";

export const RESUMABLE_MISSION_STATUSES = ["drafting", "active"] as const;

const SOURCE_STATUSES: Record<
  MissionTransition,
  readonly [MissionStatus, ...MissionStatus[]]
> = {
  start: RESUMABLE_MISSION_STATUSES,
  complete: ["active", "completed"],
  skip: ["drafting", "active", "skipped"],
};

export const sourceStatusesForMissionTransition = (
  transition: MissionTransition,
): readonly [MissionStatus, ...MissionStatus[]] => SOURCE_STATUSES[transition];
