export const RESUMABLE_MISSION_STATUSES = ["drafting", "active"] as const;

export const isEligibleForMission = ({
  run,
  parentNode,
}: {
  readonly run: { readonly mode: string };
  readonly parentNode: { readonly kind: string } | null;
}): boolean => run.mode === "complete" && parentNode?.kind === "outcome";
