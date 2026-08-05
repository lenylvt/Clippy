/** @typedef {{
 *   id: string;
 *   status: string;
 *   stage: string;
 *   progress: number;
 *   clipId?: string | null;
 *   url?: string;
 *   galleryUrl?: string;
 *   error?: string | null;
 * }} ServerJob */

const STAGE_LABELS = {
  queued: 'En file d’attente…',
  downloading: 'Téléchargement…',
  cropping: 'Découpe…',
  uploading: 'Envoi…',
  done: 'Terminé',
  error: 'Erreur',
};

/**
 * Map server stage → clip-queue status key.
 * @param {string} stage
 */
function stageToQueueStatus(stage) {
  switch (stage) {
    case 'queued':
      return 'queued';
    case 'downloading':
      return 'download';
    case 'cropping':
      return 'crop';
    case 'uploading':
      return 'upload';
    case 'done':
      return 'done';
    case 'error':
      return 'error';
    default:
      return 'queued';
  }
}

/**
 * @param {string} stage
 */
function labelForStage(stage) {
  return STAGE_LABELS[/** @type {keyof typeof STAGE_LABELS} */ (stage)] ?? stage;
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
 */
async function createServerJob(workerUrl, deviceToken, payload) {
  const base = workerUrl.replace(/\/+$/, '');
  if (!base) throw new Error('missing_worker_url');
  if (!deviceToken) throw new Error('missing_device_token');

  const response = await fetch(`${base}/api/jobs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${deviceToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error ?? `create_job_${response.status}`);
  }
  return /** @type {{ jobId: string; stage: string; progress: number }} */ (data);
}

/**
 * @param {string} workerUrl
 * @param {string} deviceToken
 * @param {string} jobId
 * @returns {Promise<ServerJob>}
 */
async function getServerJob(workerUrl, deviceToken, jobId) {
  const base = workerUrl.replace(/\/+$/, '');
  const response = await fetch(`${base}/api/jobs/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${deviceToken}` },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok || !data.job) {
    throw new Error(data?.error ?? `get_job_${response.status}`);
  }
  return data.job;
}

/**
 * Poll until done/error.
 * @param {string} workerUrl
 * @param {string} deviceToken
 * @param {string} jobId
 * @param {(job: ServerJob) => void} onUpdate
 * @param {{ intervalMs?: number; timeoutMs?: number }} [opts]
 */
async function pollServerJob(workerUrl, deviceToken, jobId, onUpdate, opts = {}) {
  const intervalMs = opts.intervalMs ?? 500;
  const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const job = await getServerJob(workerUrl, deviceToken, jobId);
    onUpdate(job);
    if (job.stage === 'done' || job.status === 'done') return job;
    if (job.stage === 'error' || job.status === 'error') {
      throw new Error(job.error || 'job_failed');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('job_timeout');
}

globalThis.createServerJob = createServerJob;
globalThis.getServerJob = getServerJob;
globalThis.pollServerJob = pollServerJob;
globalThis.stageToQueueStatus = stageToQueueStatus;
globalThis.labelForStage = labelForStage;
