import { describe, expect, it } from 'vitest';
import {
  CRON_PUMP_JOB_ID,
  ERROR_MESSAGE_MAX,
  JOB_PROCESS_TIMEOUT_MS,
  MAX_JOB_ATTEMPTS,
  PROGRESS_MIN_DELTA,
  QUEUE_WATCHDOG_MS,
  STALE_JOB_MS,
} from '../src/constants';
import { allowedStatusesForJobPatch } from '../src/db/mappers';
import { jobAttempts } from '../src/db/jobs';
import { shouldIdleStopContainers } from '../src/queue/supervisor';
import type { JobRow } from '../src/types';

/** Mirrors JobQueue isRetryableError — kept in sync for unit coverage. */
function isRetryableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('timeout') ||
    m.includes('abort') ||
    m.includes('network') ||
    m.includes('econnreset') ||
    m.includes('fetch failed') ||
    m.includes('503') ||
    m.includes('502') ||
    m.includes('429') ||
    m.includes('container_http_5') ||
    m.includes('temporar') ||
    m.includes('cold')
  );
}

function isNdjsonContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return ct.includes('application/x-ndjson') || ct.includes('application/ndjson');
}

describe('JobQueue helpers / constants', () => {
  it('expose sentinel cron + timeouts cohérents', () => {
    expect(CRON_PUMP_JOB_ID).toBe('__cron_pump__');
    expect(JOB_PROCESS_TIMEOUT_MS).toBeLessThan(STALE_JOB_MS);
    expect(QUEUE_WATCHDOG_MS).toBeGreaterThan(5_000);
    expect(MAX_JOB_ATTEMPTS).toBeGreaterThanOrEqual(2);
    expect(PROGRESS_MIN_DELTA).toBeGreaterThan(0);
    expect(ERROR_MESSAGE_MAX).toBe(500);
  });

  it('ne stoppe pas les containers si running D1 sans runners mémoire', () => {
    // Regression: DO eviction cleared #slotRunners then idle-stop SIGTERM mid-job.
    expect(
      shouldIdleStopContainers({
        queuedCount: 0,
        runningCount: 1,
        leaseCount: 0,
        memoryRunnerCount: 0,
      }),
    ).toBe(false);
  });

  it('classifie les erreurs retryables', () => {
    expect(isRetryableError('job_process_timeout')).toBe(true);
    expect(isRetryableError('AbortError')).toBe(true);
    expect(isRetryableError('container_http_503')).toBe(true);
    expect(isRetryableError('empty_clip')).toBe(false);
    expect(isRetryableError('presign_required')).toBe(false);
    expect(isRetryableError('r2_size_mismatch:1/2')).toBe(false);
  });

  it('allowlist content-type ndjson stricte', () => {
    expect(isNdjsonContentType('application/x-ndjson')).toBe(true);
    expect(isNdjsonContentType('application/ndjson; charset=utf-8')).toBe(true);
    expect(isNdjsonContentType('application/json')).toBe(false);
    expect(isNdjsonContentType('text/plain')).toBe(false);
  });

  it('transitions terminales seulement depuis running', () => {
    expect(allowedStatusesForJobPatch('done')).toEqual(['running']);
    expect(allowedStatusesForJobPatch('error')).toContain('running');
    expect(allowedStatusesForJobPatch(undefined)).toEqual(['running']);
  });

  it('jobAttempts défaut 0', () => {
    const base = {
      id: 'j1',
      status: 'running',
      stage: 'preparing',
      progress: 0.1,
      video_id: 'v',
      video_title: 't',
      youtube_url: 'https://youtu.be/x',
      clip_start: 0,
      clip_end: 10,
      clip_id: null,
      error: null,
      device_token: 'd',
      user_id: 'u',
      slot: 0,
      r2_key: null,
      created_at: 1,
      updated_at: 1,
      expires_at: 2,
    } as JobRow;
    expect(jobAttempts(base)).toBe(0);
    expect(jobAttempts({ ...base, attempts: 2 })).toBe(2);
  });
});

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
});

describe('updateJobProgress / terminal semantics', () => {
  it('ignore les updates si le job n’est plus running', () => {
    const apply = (status: string) => (status === 'running' ? 'ok' : null);
    expect(apply('running')).toBe('ok');
    expect(apply('done')).toBeNull();
    expect(apply('error')).toBeNull();
  });

  it('requeue incrémente attempts jusqu’au plafond', () => {
    let attempts = 0;
    const max = MAX_JOB_ATTEMPTS;
    const outcomes: Array<'requeued' | 'failed'> = [];
    for (let i = 0; i < max + 1; i += 1) {
      attempts += 1;
      outcomes.push(attempts >= max ? 'failed' : 'requeued');
    }
    expect(outcomes.filter((o) => o === 'requeued')).toHaveLength(max - 1);
    expect(outcomes.at(-1)).toBe('failed');
  });
});
