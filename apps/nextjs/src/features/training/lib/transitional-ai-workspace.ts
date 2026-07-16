import type { RouterOutputs } from "@acme/api";

/**
 * The aiWorkspace cache shape while an optimistic unit advance is in flight.
 * The pending fields exist only client-side — the shell's onMutate writes
 * them and any successful server refetch clears them by replacement.
 */
export type TransitionalAiWorkspace =
  RouterOutputs["training"]["aiWorkspace"] & {
    pendingNextUnit?: boolean;
    pendingNextUnitTitle?: string;
  };
