import { describe, expect, it } from 'vitest';
import { STALE_JOB_MS } from '../src/constants';
import {
  isJobStale,
  isSlotClaimable,
  leaseKey,
  orphanJobAction,
  shouldIdleStopContainers,
} from '../src/queue/supervisor';

describe('supervisor leases / idle stop', () => {
  it('leaseKey est stable par slot', () => {
    expect(leaseKey(0)).toBe('lease:slot-0');
    expect(leaseKey(3)).toBe('lease:slot-3');
  });

  it('bloque idle stop si D1 a un job running même sans runners mémoire', () => {
    expect(
      shouldIdleStopContainers({
        queuedCount: 0,
        runningCount: 3,
        leaseCount: 0,
        memoryRunnerCount: 0,
      }),
    ).toBe(false);
  });

  it('bloque idle stop si lease DO présent', () => {
    expect(
      shouldIdleStopContainers({
        queuedCount: 0,
        runningCount: 0,
        leaseCount: 1,
        memoryRunnerCount: 0,
      }),
    ).toBe(false);
  });

  it('autorise idle stop seulement quand tout est vide', () => {
    expect(
      shouldIdleStopContainers({
        queuedCount: 0,
        runningCount: 0,
        leaseCount: 0,
        memoryRunnerCount: 0,
      }),
    ).toBe(true);
  });

  it('refuse claim sur slot busy (D1/lease) même sans runner mémoire', () => {
    const busySlots = new Set([0, 2]);
    expect(
      isSlotClaimable(0, { hasMemoryRunner: false, busySlots }),
    ).toBe(false);
    expect(
      isSlotClaimable(1, { hasMemoryRunner: false, busySlots }),
    ).toBe(true);
    expect(
      isSlotClaimable(1, { hasMemoryRunner: true, busySlots }),
    ).toBe(false);
  });
});

describe('supervisor orphan actions', () => {
  it('laisse le runner mémoire propriétaire', () => {
    expect(
      orphanJobAction({ hasMemoryRunner: true, r2Ready: true, isStale: true }),
    ).toBeNull();
  });

  it('récupère via R2 avant requeue', () => {
    expect(
      orphanJobAction({ hasMemoryRunner: false, r2Ready: true, isStale: false }),
    ).toBe('recover_r2');
    expect(
      orphanJobAction({ hasMemoryRunner: false, r2Ready: true, isStale: true }),
    ).toBe('recover_r2');
  });

  it('attend un heartbeat frais sans R2', () => {
    expect(
      orphanJobAction({ hasMemoryRunner: false, r2Ready: false, isStale: false }),
    ).toBe('wait');
  });

  it('requeue quand stale sans R2', () => {
    expect(
      orphanJobAction({ hasMemoryRunner: false, r2Ready: false, isStale: true }),
    ).toBe('requeue');
  });

  it('isJobStale sur updated_at et expires_at', () => {
    const now = 1_000_000;
    expect(
      isJobStale({ updated_at: now - STALE_JOB_MS - 1, expires_at: now + 999 }, now, STALE_JOB_MS),
    ).toBe(true);
    expect(
      isJobStale({ updated_at: now - 1000, expires_at: now - 1 }, now, STALE_JOB_MS),
    ).toBe(true);
    expect(
      isJobStale({ updated_at: now - 1000, expires_at: now + 999 }, now, STALE_JOB_MS),
    ).toBe(false);
  });
});
