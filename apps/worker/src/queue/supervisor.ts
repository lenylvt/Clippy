/**
 * Pure helpers for JobQueue↔container supervision.
 * Truth for busy slots = D1 running + DO leases (not in-memory runners alone).
 */

export type SlotLease = {
  jobId: string;
  startedAt: number;
};

export type OrphanAction = 'wait' | 'recover_r2' | 'requeue';

export function leaseKey(slot: number): string {
  return `lease:slot-${slot}`;
}

/** Idle stop only when D1 + leases + memory all agree the queue is empty. */
export function shouldIdleStopContainers(opts: {
  queuedCount: number;
  runningCount: number;
  leaseCount: number;
  memoryRunnerCount: number;
}): boolean {
  return (
    opts.queuedCount === 0 &&
    opts.runningCount === 0 &&
    opts.leaseCount === 0 &&
    opts.memoryRunnerCount === 0
  );
}

/** Slot may accept a new claim only if nothing (memory / D1 / lease) owns it. */
export function isSlotClaimable(
  slot: number,
  opts: {
    hasMemoryRunner: boolean;
    busySlots: ReadonlySet<number>;
  },
): boolean {
  if (opts.hasMemoryRunner) return false;
  if (opts.busySlots.has(slot)) return false;
  return true;
}

/**
 * Decide what to do with a running job that has no in-memory runner
 * (DO woke up after eviction / deploy).
 */
export function orphanJobAction(opts: {
  hasMemoryRunner: boolean;
  r2Ready: boolean;
  isStale: boolean;
}): OrphanAction | null {
  if (opts.hasMemoryRunner) return null;
  if (opts.r2Ready) return 'recover_r2';
  if (opts.isStale) return 'requeue';
  return 'wait';
}

export function isJobStale(
  job: { updated_at: number; expires_at: number },
  now: number,
  staleMs: number,
): boolean {
  return job.updated_at < now - staleMs || job.expires_at <= now;
}
