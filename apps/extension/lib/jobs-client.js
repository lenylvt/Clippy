/**
 * Worker jobs HTTP client (single implementation for SW).
 * Validates workerUrl allowlist before sending Bearer tokens.
 */

/** @typedef {{
 *   id: string;
 *   status: string;
 *   stage: string;
 *   progress: number;
 *   clipId?: string | null;
 *   url?: string;
 *   error?: string | null;
 *   videoId?: string;
 *   clipStart?: number;
 *   clipEnd?: number;
 * }} ServerJob */

const DEFAULT_JOB_POLL_INTERVAL_MS = 1000;
const DEFAULT_JOB_POLL_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
const MAX_NETWORK_RETRIES = 4;
const MAX_POLL_INTERVAL_MS = 5000;

/** @type {ReadonlyMap<string, string>} */
const JOB_ERROR_LABELS = new Map([
  ['pairing_required', 'Relie l’app (réglages → QR)'],
  ['unauthorized', 'Session expirée — relie l’app'],
  ['not_found', 'Job introuvable'],
  ['missing_device_token', 'Appareil non configuré'],
  ['missing_worker_url', 'Configure l’URL worker (réglages)'],
  ['invalid_worker_url', 'URL worker invalide'],
  ['invalid_payload', 'Données invalides'],
  ['invalid_video_id', 'Vidéo introuvable'],
  ['invalid_youtube_url', 'URL YouTube invalide'],
  ['invalid_range', 'Plage de clip invalide'],
  ['invalid_clip_range', 'Plage de clip invalide'],
  ['clip_too_short', 'Clip trop court'],
  ['clip_too_long', 'Clip trop long'],
  ['missing_video_id', 'Vidéo introuvable'],
  ['create_clip_failed', 'Échec de création'],
  ['create_job_missing_id', 'Réponse serveur invalide'],
  ['missing_clip_result', 'Clip terminé sans fichier'],
  ['job_timeout', 'Délai dépassé'],
  ['job_failed', 'Échec'],
  ['network_error', 'Réseau indisponible'],
  ['aborted', 'Annulé'],
  ['sw_no_response', 'Extension indisponible — recharge la page'],
  ['sw_unreachable', 'Extension indisponible — recharge la page'],
  ['extension_context_invalidated', 'Recharge la page'],
]);

/**
 * @param {string} code
 * @returns {string}
 */
function labelForJobError(code) {
  const key = String(code || '').trim();
  if (!key) return JOB_ERROR_LABELS.get('job_failed') ?? 'Échec';
  if (JOB_ERROR_LABELS.has(key)) return /** @type {string} */ (JOB_ERROR_LABELS.get(key));
  if (/^create_job_\d+$/.test(key) || /^get_job_\d+$/.test(key)) {
    return 'Erreur serveur';
  }
  if (/failed to fetch|networkerror|load failed/i.test(key)) {
    return /** @type {string} */ (JOB_ERROR_LABELS.get('network_error'));
  }
  return 'Échec';
}

/**
 * @param {string} workerUrl
 * @returns {string}
 */
function normalizeWorkerUrl(workerUrl) {
  const assert = globalThis.assertWorkerUrl;
  if (typeof assert === 'function') return assert(workerUrl);
  const base = String(workerUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('missing_worker_url');
  try {
    const parsed = new URL(base);
    return parsed.origin;
  } catch {
    throw new Error('invalid_worker_url');
  }
}

/**
 * @param {string} workerUrl
 * @returns {string}
 */
function workerBase(workerUrl) {
  return normalizeWorkerUrl(workerUrl);
}

/**
 * @param {AbortSignal | undefined} outer
 * @param {number} timeoutMs
 * @returns {{ signal: AbortSignal; clear: () => void }}
 */
function withTimeout(outer, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', onOuterAbort, { once: true });
  }

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
    },
  };
}

/**
 * @param {Response} response
 * @returns {Promise<any>}
 */
async function readJsonBody(response) {
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 200) };
  }
}

/**
 * @param {number} status
 * @param {any} data
 * @returns {string}
 */
function errorCodeFromResponse(status, data) {
  if (data && typeof data.error === 'string' && data.error) return data.error;
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'pairing_required';
  if (status === 404) return 'not_found';
  return `http_${status}`;
}

/**
 * @param {number} status
 */
function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

/**
 * @param {string} code
 */
function isFatalJobError(code) {
  return (
    code === 'unauthorized' ||
    code === 'pairing_required' ||
    code === 'not_found' ||
    code === 'missing_device_token' ||
    code === 'missing_job_id' ||
    code === 'invalid_worker_url' ||
    code === 'missing_worker_url' ||
    code === 'aborted'
  );
}

/**
 * @param {string} url
 * @param {RequestInit} init
 * @param {{ signal?: AbortSignal; timeoutMs?: number; retries?: number }} [opts]
 */
async function fetchJson(url, init, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const retries = opts.retries ?? MAX_NETWORK_RETRIES;
  let lastError = /** @type {Error | null} */ (null);

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts.signal?.aborted) throw new Error('aborted');

    const { signal, clear } = withTimeout(opts.signal, timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal,
        credentials: 'omit',
      });
      clear();

      const data = await readJsonBody(response);
      if (!response.ok) {
        const code = errorCodeFromResponse(response.status, data);
        if (isRetryableStatus(response.status) && attempt < retries) {
          const retryAfter = Number(response.headers.get('Retry-After'));
          const waitMs =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(retryAfter * 1000, 30_000)
              : Math.min(1000 * 2 ** attempt, 8000);
          await sleep(waitMs, opts.signal);
          continue;
        }
        throw new Error(code);
      }

      return { response, data };
    } catch (err) {
      clear();
      if (opts.signal?.aborted) throw new Error('aborted');
      const error = err instanceof Error ? err : new Error(String(err));
      if (isFatalJobError(error.message)) throw error;
      lastError = error;
      if (attempt >= retries) break;
      await sleep(Math.min(1000 * 2 ** attempt, 8000), opts.signal);
    }
  }

  throw lastError ?? new Error('network_error');
}

/**
 * @param {number} ms
 * @param {AbortSignal} [signal]
 */
function sleep(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * @param {string} workerUrl
 * @param {string} deviceToken
 * @param {{
 *   videoId: string;
 *   videoTitle: string;
 *   youtubeUrl: string;
 *   clipStart: number;
 *   clipEnd: number;
 * }} payload
 * @param {{ signal?: AbortSignal }} [opts]
 */
async function createServerJob(workerUrl, deviceToken, payload, opts = {}) {
  const base = workerBase(workerUrl);
  if (!deviceToken) throw new Error('missing_device_token');

  const { data } = await fetchJson(
    `${base}/api/jobs`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${deviceToken}`,
      },
      body: JSON.stringify(payload),
    },
    { signal: opts.signal },
  );

  if (!data?.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'create_clip_failed');
  }
  if (typeof data.jobId !== 'string' || !data.jobId) {
    throw new Error('create_job_missing_id');
  }
  return /** @type {{ jobId: string; stage: string; progress: number }} */ (data);
}

/**
 * @param {string} workerUrl
 * @param {string} deviceToken
 * @param {string} jobId
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<ServerJob>}
 */
async function getServerJob(workerUrl, deviceToken, jobId, opts = {}) {
  const base = workerBase(workerUrl);
  if (!deviceToken) throw new Error('missing_device_token');
  if (!jobId) throw new Error('missing_job_id');

  const { data } = await fetchJson(
    `${base}/api/jobs/${encodeURIComponent(jobId)}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${deviceToken}`,
      },
    },
    { signal: opts.signal },
  );

  if (!data?.ok || !data.job) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'not_found');
  }
  return data.job;
}

/**
 * @param {string} workerUrl
 * @param {string} deviceToken
 * @param {string} jobId
 * @param {(job: ServerJob) => void | Promise<void>} onUpdate
 * @param {{
 *   intervalMs?: number;
 *   timeoutMs?: number;
 *   signal?: AbortSignal;
 * }} [opts]
 */
async function pollServerJob(workerUrl, deviceToken, jobId, onUpdate, opts = {}) {
  let intervalMs = Math.max(
    opts.intervalMs ?? DEFAULT_JOB_POLL_INTERVAL_MS,
    DEFAULT_JOB_POLL_INTERVAL_MS,
  );
  const timeoutMs = opts.timeoutMs ?? DEFAULT_JOB_POLL_TIMEOUT_MS;
  const started = Date.now();
  const signal = opts.signal;

  while (Date.now() - started < timeoutMs) {
    if (signal?.aborted) throw new Error('aborted');

    let job;
    try {
      job = await getServerJob(workerUrl, deviceToken, jobId, { signal });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'aborted' || isFatalJobError(message)) throw err;
      // Transient network / 5xx: keep polling with backoff (job may still finish).
      const remaining = timeoutMs - (Date.now() - started);
      if (remaining <= 0) break;
      const wait = Math.min(intervalMs, remaining);
      await sleep(wait, signal);
      intervalMs = Math.min(Math.round(intervalMs * 1.5), MAX_POLL_INTERVAL_MS);
      continue;
    }

    try {
      await onUpdate(job);
    } catch (err) {
      if (typeof globalThis.clippyLog === 'function') {
        globalThis.clippyLog('jobs', 'onUpdate:fail', {
          jobId,
          error: String(err),
        });
      }
    }

    // Stage is the source of truth (status can lag).
    if (job.stage === 'done') {
      if (!job.clipId || !job.url) throw new Error('missing_clip_result');
      return job;
    }
    if (job.stage === 'error') {
      throw new Error(job.error || 'job_failed');
    }

    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 0) break;

    const wait = Math.min(intervalMs, remaining);
    await sleep(wait, signal);
    intervalMs = Math.min(Math.round(intervalMs * 1.25), MAX_POLL_INTERVAL_MS);
  }
  throw new Error('job_timeout');
}

export {
  createServerJob,
  getServerJob,
  pollServerJob,
  labelForJobError,
  normalizeWorkerUrl,
  DEFAULT_JOB_POLL_INTERVAL_MS,
  DEFAULT_JOB_POLL_TIMEOUT_MS,
};

globalThis.createServerJob = createServerJob;
globalThis.getServerJob = getServerJob;
globalThis.pollServerJob = pollServerJob;
globalThis.labelForJobError = labelForJobError;
globalThis.normalizeWorkerUrl = normalizeWorkerUrl;
globalThis.DEFAULT_JOB_POLL_INTERVAL_MS = DEFAULT_JOB_POLL_INTERVAL_MS;
globalThis.DEFAULT_JOB_POLL_TIMEOUT_MS = DEFAULT_JOB_POLL_TIMEOUT_MS;
