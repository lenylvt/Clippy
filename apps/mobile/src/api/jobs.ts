import { api, type ApiOptions } from './client';
import type { Job, Ok } from './types';

const ACTIVE_QUERY = true;

export type FetchJobsOpts = Pick<ApiOptions, 'signal'> & {
  /** Default true — prefer the cheap active list for mobile polling. */
  activeOnly?: boolean;
};

function normalizeJobsOpts(
  activeOnlyOrOpts: boolean | FetchJobsOpts = {},
): FetchJobsOpts {
  if (typeof activeOnlyOrOpts === 'boolean') {
    return { activeOnly: activeOnlyOrOpts };
  }
  return activeOnlyOrOpts;
}

export function fetchMyJobs(token: string, activeOnlyOrOpts: boolean | FetchJobsOpts = {}) {
  const opts = normalizeJobsOpts(activeOnlyOrOpts);
  const activeOnly = opts.activeOnly ?? ACTIVE_QUERY;
  return api<Ok<{ jobs: Job[] }>>('/api/me/jobs', {
    token,
    signal: opts.signal,
    query: activeOnly ? { active: true } : undefined,
  });
}

/** Dismiss a failed job (server only deletes `status=error`). */
export function deleteJob(
  token: string,
  jobId: string,
  opts?: Pick<ApiOptions, 'signal'>,
) {
  return api<Ok>(`/api/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
    token,
    signal: opts?.signal,
  });
}

export type PollMyJobsOpts = FetchJobsOpts & {
  onUpdate: (jobs: Job[]) => void;
  /** Base interval between polls (default 1500ms). */
  intervalMs?: number;
  /** Cap for backoff when the active list is empty (default 10s). */
  maxIntervalMs?: number;
  /** Stop when the active list is empty (default true if activeOnly). */
  whileActive?: boolean;
  /** Overall deadline; resolves without throwing. */
  timeoutMs?: number;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Poll `/api/me/jobs` with adaptive interval, AbortSignal, and optional stop
 * when there are no active jobs.
 */
export async function pollMyJobs(token: string, opts: PollMyJobsOpts): Promise<Job[]> {
  const intervalMs = opts.intervalMs ?? 1_500;
  const maxIntervalMs = opts.maxIntervalMs ?? 10_000;
  const activeOnly = opts.activeOnly ?? true;
  const whileActive = opts.whileActive ?? activeOnly;
  const started = Date.now();
  let delay = intervalMs;
  let last: Job[] = [];

  while (!opts.signal?.aborted) {
    if (opts.timeoutMs != null && Date.now() - started >= opts.timeoutMs) {
      return last;
    }

    const { jobs } = await fetchMyJobs(token, { activeOnly, signal: opts.signal });
    last = jobs;
    opts.onUpdate(jobs);

    if (whileActive && jobs.length === 0) {
      return last;
    }

    const busy = jobs.some(
      (j) =>
        j.status === 'running' ||
        j.stage === 'downloading' ||
        j.stage === 'cropping' ||
        j.stage === 'uploading' ||
        j.stage === 'preparing',
    );
    delay = busy ? intervalMs : Math.min(Math.round(delay * 1.25), maxIntervalMs);

    try {
      await sleep(delay, opts.signal);
    } catch {
      return last;
    }
  }

  return last;
}
