import '../lib/log.js';
import '../lib/config.js';
import '../lib/clip-constants.js';
import '../lib/stages.js';
import '../lib/title.js';
import '../lib/semver.js';
import '../lib/update-check.js';
import {
  createServerJob,
  labelForJobError,
  normalizeWorkerUrl,
  pollServerJob,
} from '../lib/jobs-client.js';

const DEVICE_TOKEN_KEY = 'clippy.deviceToken';
const LEGACY_DEVICE_TOKEN_KEY = 'deviceToken';
const INFLIGHT_JOBS_KEY = 'clippy.inflightJobs';
const POLL_ALARM_NAME = 'clippy.resume-inflight';
const UPDATE_ALARM_NAME = 'clippy.check-update';
const UPDATE_ALARM_MINUTES = 12 * 60;
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
/** Aligné `apps/worker/src/auth/bearer.ts`. */
const TOKEN_RE = /^[a-zA-Z0-9_-]{16,128}$/;
const MAX_NOTIFY_FAILS = 5;

/** @type {Promise<unknown>} */
let deviceTokenMutex = Promise.resolve();

/** @type {Map<string, AbortController>} */
const activeWatches = new Map();

/** @type {Map<number, number>} */
const notifyFailCounts = new Map();

/**
 * @typedef {{
 *   serverJobId: string;
 *   clientJobId?: string;
 *   tabId?: number;
 *   workerUrl: string;
 *   deviceToken: string;
 *   startedAt: number;
 * }} InflightJob
 */

/**
 * @returns {string}
 */
function generateDeviceToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isValidDeviceToken(value) {
  return typeof value === 'string' && TOKEN_RE.test(value);
}

/**
 * Lit le token stocké sans en créer un nouveau.
 * @returns {Promise<string>}
 */
async function readStoredDeviceToken() {
  const stored = await chrome.storage.local.get([DEVICE_TOKEN_KEY, LEGACY_DEVICE_TOKEN_KEY]);
  const current = stored[DEVICE_TOKEN_KEY];
  if (isValidDeviceToken(current)) return current;
  const legacy = stored[LEGACY_DEVICE_TOKEN_KEY];
  if (isValidDeviceToken(legacy)) return legacy;
  return '';
}

/**
 * @returns {Promise<string>}
 */
async function getOrCreateDeviceToken() {
  const run = deviceTokenMutex.then(async () => {
    const stored = await chrome.storage.local.get([DEVICE_TOKEN_KEY, LEGACY_DEVICE_TOKEN_KEY]);
    const current = stored[DEVICE_TOKEN_KEY];
    if (isValidDeviceToken(current)) return current;

    const legacy = stored[LEGACY_DEVICE_TOKEN_KEY];
    if (isValidDeviceToken(legacy)) {
      await chrome.storage.local.set({ [DEVICE_TOKEN_KEY]: legacy });
      await chrome.storage.local.remove(LEGACY_DEVICE_TOKEN_KEY);
      return legacy;
    }

    const token = generateDeviceToken();
    await chrome.storage.local.set({ [DEVICE_TOKEN_KEY]: token });
    const verify = await chrome.storage.local.get(DEVICE_TOKEN_KEY);
    if (isValidDeviceToken(verify[DEVICE_TOKEN_KEY])) return verify[DEVICE_TOKEN_KEY];
    return token;
  });
  deviceTokenMutex = run.then(
    () => undefined,
    () => undefined,
  );
  return /** @type {Promise<string>} */ (run);
}

/**
 * @returns {Promise<Record<string, InflightJob>>}
 */
async function readInflightJobs() {
  const stored = await chrome.storage.session.get(INFLIGHT_JOBS_KEY);
  const raw = stored[INFLIGHT_JOBS_KEY];
  if (!raw || typeof raw !== 'object') return {};
  return /** @type {Record<string, InflightJob>} */ (raw);
}

/**
 * @param {Record<string, InflightJob>} jobs
 */
async function writeInflightJobs(jobs) {
  await chrome.storage.session.set({ [INFLIGHT_JOBS_KEY]: jobs });
}

/**
 * @param {InflightJob} flight
 */
async function upsertInflightJob(flight) {
  const jobs = await readInflightJobs();
  jobs[flight.serverJobId] = flight;
  await writeInflightJobs(jobs);
}

/**
 * @param {string} serverJobId
 */
async function removeInflightJob(serverJobId) {
  const jobs = await readInflightJobs();
  if (!(serverJobId in jobs)) return;
  delete jobs[serverJobId];
  await writeInflightJobs(jobs);
}

/**
 * @param {number | undefined} tabId
 * @param {string} label
 * @param {{
 *   variant?: 'default' | 'error';
 *   jobId?: string;
 *   stage?: string;
 *   progress?: number;
 *   url?: string;
 * }} [options]
 * @returns {Promise<boolean>} true si le message a été délivré
 */
async function tryNotifyTabStatus(tabId, label, options = {}) {
  if (!tabId) return false;
  try {
    if (options.jobId) {
      await chrome.tabs.sendMessage(tabId, {
        type: 'CLIPPY_JOB_PROGRESS',
        jobId: options.jobId,
        stage: options.stage,
        label,
        progress: options.progress,
        variant: options.variant ?? 'default',
        url: options.url,
      });
    } else {
      await chrome.tabs.sendMessage(tabId, {
        type: 'CLIPPY_STATUS',
        label,
        variant: options.variant ?? 'default',
      });
    }
    notifyFailCounts.delete(tabId);
    return true;
  } catch (err) {
    const count = (notifyFailCounts.get(tabId) ?? 0) + 1;
    notifyFailCounts.set(tabId, count);
    clippyLog('bg', 'notify:fail', { tabId, count, error: String(err) });
    return false;
  }
}

/**
 * Aligné matches content script `*://www.youtube.com/watch*`.
 * @param {string | undefined} url
 */
function isYoutubeWatchUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'www.youtube.com' && parsed.pathname.startsWith('/watch');
  } catch {
    return false;
  }
}

/**
 * @param {number} tabId
 */
async function openEditorInTab(tabId) {
  clippyLog('bg', 'open_editor', { tabId });
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'OPEN_CLIP_EDITOR' });
  } catch (err) {
    clippyLog('bg', 'open_editor:content_unavailable', { tabId, error: String(err) });
  }
}

async function openEditorInActiveWatchTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isYoutubeWatchUrl(tab.url)) {
    clippyLog('bg', 'open_editor:skip', { url: tab?.url });
    return;
  }
  await openEditorInTab(tab.id);
}

/**
 * @param {unknown} message
 * @returns {string | null}
 */
function validateCreateClipMessage(message) {
  if (!message || typeof message !== 'object') return 'invalid_payload';
  const m = /** @type {Record<string, unknown>} */ (message);
  if (typeof m.videoId !== 'string' || !VIDEO_ID_RE.test(m.videoId)) return 'invalid_video_id';
  if (typeof m.youtubeUrl !== 'string') return 'invalid_youtube_url';
  try {
    const parsed = new URL(m.youtubeUrl);
    if (parsed.hostname !== 'www.youtube.com' || !parsed.pathname.startsWith('/watch')) {
      return 'invalid_youtube_url';
    }
    if (parsed.searchParams.get('v') !== m.videoId) return 'invalid_youtube_url';
  } catch {
    return 'invalid_youtube_url';
  }
  if (typeof m.start !== 'number' || typeof m.end !== 'number') return 'invalid_range';
  if (
    !Number.isFinite(m.start) ||
    !Number.isFinite(m.end) ||
    m.start < 0 ||
    m.end <= m.start
  ) {
    return 'invalid_range';
  }
  const duration = m.end - m.start;
  if (duration < globalThis.MIN_CLIP_SECONDS) return 'clip_too_short';
  if (duration > globalThis.MAX_CLIP_SECONDS) return 'clip_too_long';
  if (m.jobId != null && typeof m.jobId !== 'string') return 'invalid_payload';
  return null;
}

/**
 * @returns {Promise<string>}
 */
async function resolveWorkerUrl() {
  const settings = await chrome.storage.sync.get(['workerUrl']);
  return normalizeWorkerUrl(settings.workerUrl || globalThis.CLIPPY_DEFAULT_WORKER_URL);
}

/**
 * @param {string} workerUrl
 * @param {string} deviceToken
 */
async function unlinkDeviceOnServer(workerUrl, deviceToken) {
  try {
    const base = normalizeWorkerUrl(workerUrl);
    await fetch(`${base}/api/pairing/unlink`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${deviceToken}` },
      credentials: 'omit',
    });
  } catch (err) {
    clippyLog('bg', 'unlink:fail', { error: String(err) });
  }
}

function cancelAllWatches() {
  for (const [id, ctrl] of activeWatches) {
    ctrl.abort();
    activeWatches.delete(id);
  }
}

/**
 * @param {number} tabId
 */
async function cancelWatchesForTab(tabId) {
  const jobs = await readInflightJobs();
  for (const [serverJobId, flight] of Object.entries(jobs)) {
    if (flight.tabId !== tabId) continue;
    const ctrl = activeWatches.get(serverJobId);
    if (ctrl) {
      ctrl.abort();
      activeWatches.delete(serverJobId);
    }
    await removeInflightJob(serverJobId);
  }
}

/**
 * @param {InflightJob} flight
 */
async function watchInflightJob(flight) {
  if (activeWatches.has(flight.serverJobId)) return;

  const ctrl = new AbortController();
  activeWatches.set(flight.serverJobId, ctrl);

  try {
    const result = await pollServerJob(
      flight.workerUrl,
      flight.deviceToken,
      flight.serverJobId,
      async (job) => {
        if (job.stage === 'error') return;
        const stage = globalThis.stageToQueueStatus(job.stage);
        const label = globalThis.labelForStage(job.stage, job.progress);
        const delivered = await tryNotifyTabStatus(flight.tabId, label, {
          jobId: flight.clientJobId,
          stage,
          progress: job.progress,
          url: job.url,
          variant: 'default',
        });
        if (
          !delivered &&
          flight.tabId &&
          (notifyFailCounts.get(flight.tabId) ?? 0) >= MAX_NOTIFY_FAILS
        ) {
          ctrl.abort();
        }
      },
      { signal: ctrl.signal, intervalMs: 1000 },
    );

    clippyLog('bg', 'watch:done', {
      serverJobId: flight.serverJobId,
      clientJobId: flight.clientJobId,
      clipId: result.clipId,
    });
  } catch (err) {
    if (ctrl.signal.aborted) return;
    const code = err instanceof Error ? err.message : String(err);
    const label = labelForJobError(code);
    clippyLog('bg', 'watch:fail', {
      serverJobId: flight.serverJobId,
      error: code,
    });
    await tryNotifyTabStatus(flight.tabId, label, {
      jobId: flight.clientJobId,
      stage: 'error',
      progress: 1,
      variant: 'error',
    });
  } finally {
    activeWatches.delete(flight.serverJobId);
    await removeInflightJob(flight.serverJobId);
  }
}

async function resumeInflightJobs() {
  const jobs = await readInflightJobs();
  const entries = Object.values(jobs);
  if (!entries.length) return;
  clippyLog('bg', 'inflight:resume', { count: entries.length });
  for (const flight of entries) {
    void watchInflightJob(flight);
  }
}

async function ensurePollAlarm() {
  const existing = await chrome.alarms.get(POLL_ALARM_NAME);
  if (existing) return;
  await chrome.alarms.create(POLL_ALARM_NAME, { periodInMinutes: 1 });
}

async function ensureUpdateAlarm() {
  const existing = await chrome.alarms.get(UPDATE_ALARM_NAME);
  if (existing) return;
  await chrome.alarms.create(UPDATE_ALARM_NAME, { periodInMinutes: UPDATE_ALARM_MINUTES });
}

/**
 * @param {{ available?: boolean } | null | undefined} state
 */
async function applyUpdateBadge(state) {
  try {
    if (state?.available) {
      await chrome.action.setBadgeText({ text: 'UP' });
      await chrome.action.setBadgeBackgroundColor({ color: '#5dcc8a' });
      await chrome.action.setTitle({ title: 'Clippy — mise à jour disponible' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
      await chrome.action.setTitle({ title: 'Clippy — réglages' });
    }
  } catch (err) {
    clippyLog('bg', 'update:badge_fail', { error: String(err) });
  }
}

async function runUpdateCheck() {
  try {
    const workerUrl = await resolveWorkerUrl();
    const localVersion = chrome.runtime.getManifest().version;
    const state = await globalThis.checkExtensionUpdate(workerUrl, localVersion);
    await globalThis.writeUpdateState(state);
    await applyUpdateBadge(state);
    clippyLog('bg', 'update:checked', {
      available: state.available,
      local: state.localVersion,
      remote: state.remoteVersion,
    });
    return state;
  } catch (err) {
    clippyLog('bg', 'update:check_fail', { error: String(err) });
    return null;
  }
}

/**
 * Create the server job and start background watch. Resolves as soon as POST succeeds.
 * @param {{
 *   jobId?: string;
 *   videoId: string;
 *   youtubeUrl: string;
 *   start: number;
 *   end: number;
 *   videoTitle?: string;
 *   tabId?: number;
 * }} input
 */
async function createClipJob(input) {
  const workerUrl = await resolveWorkerUrl();
  const deviceToken = await getOrCreateDeviceToken();

  const created = await createServerJob(workerUrl, deviceToken, {
    videoId: input.videoId,
    videoTitle: globalThis.cleanYoutubeTitle(input.videoTitle || 'clip'),
    youtubeUrl: input.youtubeUrl,
    clipStart: input.start,
    clipEnd: input.end,
  });

  /** @type {InflightJob} */
  const flight = {
    serverJobId: created.jobId,
    clientJobId: input.jobId,
    tabId: input.tabId,
    workerUrl,
    deviceToken,
    startedAt: Date.now(),
  };
  await upsertInflightJob(flight);
  await ensurePollAlarm();

  await tryNotifyTabStatus(input.tabId, globalThis.labelForStage('queued'), {
    jobId: input.jobId,
    stage: 'queued',
    progress: created.progress ?? 0,
  });

  clippyLog('bg', 'create_clip:ok', {
    serverJobId: created.jobId,
    clientJobId: input.jobId,
    tabId: input.tabId,
  });

  void watchInflightJob(flight);

  return {
    ok: true,
    accepted: true,
    serverJobId: created.jobId,
    jobId: input.jobId,
  };
}

/**
 * @param {unknown} err
 */
function errorPayload(err) {
  const code = err instanceof Error ? err.message : String(err);
  return { ok: false, error: code, label: labelForJobError(code) };
}

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage().catch((err) => {
    clippyLog('bg', 'options:fail', { error: String(err) });
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'open-clip-editor') return;
  clippyLog('bg', 'command:received', { command });
  void openEditorInActiveWatchTab();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM_NAME) {
    void resumeInflightJobs();
    return;
  }
  if (alarm.name === UPDATE_ALARM_NAME) {
    void runUpdateCheck();
  }
});

chrome.runtime.onStartup.addListener(() => {
  void ensurePollAlarm();
  void ensureUpdateAlarm();
  void resumeInflightJobs();
  void runUpdateCheck();
});

chrome.runtime.onInstalled.addListener(() => {
  void ensurePollAlarm();
  void ensureUpdateAlarm();
  void resumeInflightJobs();
  void runUpdateCheck();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void cancelWatchesForTab(tabId);
  notifyFailCounts.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'CREATE_CLIP') {
    const tabId = sender.tab?.id;
    const invalid = validateCreateClipMessage(message);
    if (invalid) {
      const payload = { ok: false, error: invalid, label: labelForJobError(invalid) };
      void tryNotifyTabStatus(tabId, payload.label, {
        jobId: typeof message.jobId === 'string' ? message.jobId : undefined,
        stage: 'error',
        variant: 'error',
        progress: 1,
      });
      sendResponse(payload);
      return false;
    }

    createClipJob({
      jobId: message.jobId,
      videoId: message.videoId,
      youtubeUrl: message.youtubeUrl,
      start: message.start,
      end: message.end,
      videoTitle: message.videoTitle,
      tabId,
    })
      .then((result) => sendResponse(result))
      .catch((err) => {
        const payload = errorPayload(err);
        clippyLog('bg', 'create_clip:fail', { error: payload.error });
        void tryNotifyTabStatus(tabId, payload.label, {
          jobId: typeof message.jobId === 'string' ? message.jobId : undefined,
          stage: 'error',
          variant: 'error',
          progress: 1,
        });
        sendResponse(payload);
      });
    return true;
  }

  if (message?.type === 'GET_DEVICE_TOKEN') {
    if (sender.id && sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, error: 'unauthorized' });
      return false;
    }
    getOrCreateDeviceToken()
      .then((token) => sendResponse({ ok: true, token }))
      .catch((err) => sendResponse(errorPayload(err)));
    return true;
  }

  if (message?.type === 'RESET_DEVICE_TOKEN') {
    if (sender.id && sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, error: 'unauthorized' });
      return false;
    }
    (async () => {
      cancelAllWatches();
      await writeInflightJobs({});
      const oldToken = await readStoredDeviceToken();
      try {
        const workerUrl = await resolveWorkerUrl();
        if (oldToken) await unlinkDeviceOnServer(workerUrl, oldToken);
      } catch (err) {
        clippyLog('bg', 'reset:unlink_skip', { error: String(err) });
      }
      await chrome.storage.local.remove([DEVICE_TOKEN_KEY, LEGACY_DEVICE_TOKEN_KEY]);
      const token = await getOrCreateDeviceToken();
      sendResponse({ ok: true, token });
    })().catch((err) => sendResponse(errorPayload(err)));
    return true;
  }

  if (message?.type === 'GET_UPDATE_STATUS') {
    if (sender.id && sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, error: 'unauthorized' });
      return false;
    }
    (async () => {
      const force = Boolean(message?.force);
      let state = force ? null : await globalThis.readUpdateState();
      if (!state || force) {
        state = await runUpdateCheck();
      } else {
        await applyUpdateBadge(state);
      }
      sendResponse({ ok: true, update: state });
    })().catch((err) => sendResponse(errorPayload(err)));
    return true;
  }

  clippyLog('bg', 'message:unknown', { type: message?.type });
  return false;
});

void ensurePollAlarm();
void ensureUpdateAlarm();
void resumeInflightJobs();
void runUpdateCheck();
