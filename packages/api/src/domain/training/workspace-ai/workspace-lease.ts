/**
 * Workspace turn leases are heartbeat-backed rather than long-dated.
 *
 * The request that owns a turn renews both leases (the turn row and its unit
 * run) every `WORKSPACE_LEASE_HEARTBEAT_MS` for as long as it is alive, so a
 * lease that has stopped moving means its owner is gone — killed invocation,
 * rolled deploy, crashed process. Nothing in-process can report that, which is
 * why expiry, not a client-supplied "force" flag, is the sole arbiter of
 * ownership.
 *
 * The TTL is therefore sized to "a few missed heartbeats" — how fast a dead
 * turn frees its unit — and not to how long a turn may legitimately run. A
 * long turn stays protected because it keeps renewing.
 */
export const WORKSPACE_LEASE_TTL_MS = 30_000;

export const WORKSPACE_LEASE_HEARTBEAT_MS = 10_000;

export const workspaceLeaseExpiry = (now: Date = new Date()): Date =>
  new Date(now.getTime() + WORKSPACE_LEASE_TTL_MS);
