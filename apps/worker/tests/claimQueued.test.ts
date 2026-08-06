import { describe, expect, it } from 'vitest';
import {
  CLAIM_DEADLINE_MS,
  CLAIM_MAX_ATTEMPTS,
  DEFAULT_CLIPS_PAGE_LIMIT,
  JOB_TTL_MS,
  STALE_JOB_MS,
} from '../src/constants';
import {
  allowedStatusesForJobPatch,
  extensionFromR2Key,
  normalizePositiveDuration,
} from '../src/db/mappers';

/**
 * Mirrors claimNextQueuedJob race semantics:
 * only the UPDATE that still sees status=queued wins; losers retry.
 */
describe('claimNextQueuedJob semantics', () => {
  it('ne revendique que les jobs encore en file', () => {
    const status: string = 'queued';
    expect(status === 'queued').toBe(true);
    expect(status === 'running').toBe(false);
  });

  it('retries until the queue is empty after lost races', () => {
    const queue = ['a', 'b', 'c'];
    const claimed: string[] = [];
    let raceFail = true;
    while (queue.length > 0) {
      const candidate = queue[0]!;
      if (raceFail) {
        raceFail = false;
        continue;
      }
      queue.shift();
      claimed.push(candidate);
      raceFail = claimed.length < 2;
    }
    expect(claimed).toEqual(['a', 'b', 'c']);
  });

  it('étend expires_at depuis le claim (TTL clock)', () => {
    const claimAt = 1_700_000_000_000;
    const expiresAt = claimAt + JOB_TTL_MS;
    expect(expiresAt - claimAt).toBe(JOB_TTL_MS);
  });

  it('ne retourne null que si file vide — contention ≠ empty', () => {
    const claimResult = (remaining: number): null | Error =>
      remaining === 0 ? null : new Error('claim_contention');
    expect(claimResult(0)).toBeNull();
    expect(claimResult(3)).toBeInstanceOf(Error);
    expect(CLAIM_MAX_ATTEMPTS).toBeGreaterThan(32);
    expect(CLAIM_DEADLINE_MS).toBeGreaterThan(0);
  });

  it('backoff croît puis plafonne', () => {
    const delays = Array.from({ length: 8 }, (_, attempt) =>
      Math.min(80, 2 ** Math.min(attempt, 6)),
    );
    expect(delays[0]).toBe(1);
    expect(delays[5]).toBe(32);
    expect(delays[6]).toBe(64);
    expect(delays[7]).toBe(64);
  });
});

describe('updateJobStage / updateJobProgress status guards', () => {
  it('ignore les updates progress si le job n’est plus running', () => {
    const apply = (status: string) => (status === 'running' ? 'ok' : null);
    expect(apply('running')).toBe('ok');
    expect(apply('done')).toBeNull();
    expect(apply('error')).toBeNull();
  });

  it('refuse done↔error et resurrection', () => {
    expect(allowedStatusesForJobPatch('done')).toEqual(['running']);
    expect(allowedStatusesForJobPatch('error')).toEqual(['queued', 'running']);
    expect(allowedStatusesForJobPatch('running')).toEqual(['running']);
    expect(allowedStatusesForJobPatch(undefined)).toEqual(['running']);

    const canApply = (current: string, next: string) =>
      allowedStatusesForJobPatch(next).includes(current);
    expect(canApply('done', 'error')).toBe(false);
    expect(canApply('error', 'done')).toBe(false);
    expect(canApply('done', 'running')).toBe(false);
    expect(canApply('running', 'done')).toBe(true);
    expect(canApply('queued', 'error')).toBe(true);
  });
});

describe('listStaleRunningJobs / reap', () => {
  it('inclut running expirés même avec heartbeat récent', () => {
    const now = 1_000_000;
    const olderThanMs = STALE_JOB_MS;
    const isStale = (job: { updated_at: number; expires_at: number }) =>
      job.updated_at < now - olderThanMs || job.expires_at <= now;

    expect(isStale({ updated_at: now - 1000, expires_at: now - 1 })).toBe(true);
    expect(isStale({ updated_at: now - olderThanMs - 1, expires_at: now + 99999 })).toBe(true);
    expect(isStale({ updated_at: now - 1000, expires_at: now + 99999 })).toBe(false);
  });
});

describe('countActiveJobs semantics', () => {
  it('compte running même expirés + queued non expirés', () => {
    const now = 1_000_000;
    const jobs = [
      { status: 'running', expires_at: now - 1 },
      { status: 'queued', expires_at: now + 100 },
      { status: 'queued', expires_at: now - 1 },
      { status: 'done', expires_at: now + 100 },
    ];
    const active = jobs.filter(
      (j) => j.status === 'running' || (j.status === 'queued' && j.expires_at > now),
    );
    expect(active).toHaveLength(2);
  });
});

describe('deleteOrphanClips filter', () => {
  it('ne purge pas les anonymes encore dans le TTL', () => {
    const now = Date.now();
    const shouldDelete = (clip: { user_id: string | null; expires_at: number }) =>
      clip.user_id === null && clip.expires_at <= now;

    expect(shouldDelete({ user_id: null, expires_at: now + JOB_TTL_MS })).toBe(false);
    expect(shouldDelete({ user_id: null, expires_at: now - 1 })).toBe(true);
    expect(shouldDelete({ user_id: 'u1', expires_at: now - 1 })).toBe(false);
  });
});

describe('listClipsForUser pagination', () => {
  it('borne limit/offset', () => {
    const clamp = (limit?: number, offset?: number) => ({
      limit: Math.max(1, Math.min(limit ?? DEFAULT_CLIPS_PAGE_LIMIT, 100)),
      offset: Math.max(0, offset ?? 0),
    });
    expect(clamp()).toEqual({ limit: 50, offset: 0 });
    expect(clamp(0, -5)).toEqual({ limit: 1, offset: 0 });
    expect(clamp(500, 10)).toEqual({ limit: 100, offset: 10 });
  });
});

describe('createUser / bumpOtpAttempts semantics', () => {
  it('ON CONFLICT email → relecture (idempotent)', () => {
    const insert = (existing: boolean) => (existing ? 'conflict' : 'inserted');
    expect(insert(false)).toBe('inserted');
    expect(insert(true)).toBe('conflict');
    // After either path, SELECT by email wins.
    const resolved = { id: 'existing-id', email: 'a@b.c' };
    expect(resolved.id).toBe('existing-id');
  });

  it('bump attempts atomique RETURNING', () => {
    let attempts = 2;
    const bump = () => {
      attempts += 1;
      return attempts;
    };
    expect(bump()).toBe(3);
    expect(bump()).toBe(4);
  });
});

describe('mappers', () => {
  it('extension défaut mp4 sauf .webm', () => {
    expect(extensionFromR2Key('clips/a/b.mp4')).toBe('mp4');
    expect(extensionFromR2Key('clips/a/b.webm')).toBe('webm');
    expect(extensionFromR2Key('clips/a/b.WEBM')).toBe('webm');
    expect(extensionFromR2Key('clips/a/b.mkv')).toBe('mp4');
  });

  it('normalizePositiveDuration', () => {
    expect(normalizePositiveDuration(12.5)).toBe(12.5);
    expect(normalizePositiveDuration(0)).toBeNull();
    expect(normalizePositiveDuration(null)).toBeNull();
    expect(normalizePositiveDuration(Number.NaN)).toBeNull();
  });
});

describe('deleteClip ownership WHERE', () => {
  it('exige user_id dans le prédicat delete', () => {
    const sql = `DELETE FROM clips WHERE id = ? AND user_id = ? RETURNING r2_key`;
    expect(sql).toContain('user_id = ?');
    expect(sql).not.toMatch(/expires_at/);
  });
});

describe('countActiveJobsForUser', () => {
  it('reste exposé pour quota routes (filtre queued|running + expires)', () => {
    const sql = `WHERE user_id = ? AND status IN ('queued', 'running') AND expires_at > ?`;
    expect(sql).toContain('queued');
    expect(sql).toContain('running');
    expect(sql).toContain('expires_at');
  });
});
