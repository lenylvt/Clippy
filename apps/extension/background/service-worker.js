import '../lib/log.js';
import '../lib/config.js';
import '../lib/clip-constants.js';
import '../lib/youtube.js';
import '../lib/stages.js';
import '../lib/title.js';
import '../lib/jobs-client.js';

const DEVICE_TOKEN_KEY = 'deviceToken';

/**
 * @returns {Promise<string>}
 */
async function getOrCreateDeviceToken() {
  const stored = await chrome.storage.local.get(DEVICE_TOKEN_KEY);
  if (typeof stored[DEVICE_TOKEN_KEY] === 'string' && stored[DEVICE_TOKEN_KEY].length >= 16) {
    return stored[DEVICE_TOKEN_KEY];
  }
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await chrome.storage.local.set({ [DEVICE_TOKEN_KEY]: token });
  return token;
}

/**
 * @param {number | undefined} tabId
 * @param {string} label
 * @param {{ variant?: 'default' | 'error'; jobId?: string; stage?: string; progress?: number; url?: string }} [options]
 */
async function notifyTabStatus(tabId, label, options = {}) {
  if (!tabId) return;
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
      return;
    }
    await chrome.tabs.sendMessage(tabId, {
      type: 'CLIPPY_STATUS',
      label,
      variant: options.variant ?? 'default',
    });
  } catch {
    /* tab may be gone */
  }
}

/**
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
  const { MIN_CLIP_SECONDS, MAX_CLIP_SECONDS } = globalThis;
  const duration = input.end - input.start;
  if (duration > MAX_CLIP_SECONDS) throw new Error('clip_too_long');
  if (duration < MIN_CLIP_SECONDS) throw new Error('clip_too_short');

  const settings = await chrome.storage.sync.get(['workerUrl']);
  const workerUrl = settings.workerUrl || globalThis.CLIPPY_DEFAULT_WORKER_URL;
  const deviceToken = await getOrCreateDeviceToken();

  await notifyTabStatus(input.tabId, 'En attente', {
    jobId: input.jobId,
    stage: 'queued',
    progress: 0,
  });

  const created = await globalThis.createServerJob(workerUrl, deviceToken, {
    videoId: input.videoId,
    videoTitle: globalThis.cleanYoutubeTitle?.(input.videoTitle) || input.videoTitle || 'clip',
    youtubeUrl: input.youtubeUrl,
    clipStart: input.start,
    clipEnd: input.end,
  }).catch(async (err) => {
    if (err?.message === 'pairing_required') {
      await notifyTabStatus(input.tabId, 'Relie l’app (réglages → QR)', {
        jobId: input.jobId,
        stage: 'error',
        progress: 1,
        variant: 'error',
      });
    }
    throw err;
  });

  const serverJobId = created.jobId;

  const result = await globalThis.pollServerJob(
    workerUrl,
    deviceToken,
    serverJobId,
    (job) => {
      void notifyTabStatus(input.tabId, globalThis.labelForStage(job.stage, job.progress), {
        jobId: input.jobId,
        stage: globalThis.stageToQueueStatus(job.stage),
        progress: job.progress,
        url: job.url,
      });
    },
  );

  await notifyTabStatus(input.tabId, 'Terminé', {
    jobId: input.jobId,
    stage: 'done',
    progress: 1,
    url: result.url,
  });

  return {
    ok: true,
    id: result.clipId,
    url: result.url,
  };
}

async function openEditorInActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('youtube.com/watch')) {
    clippyLog('bg', 'open_editor:skip', { url: tab?.url });
    return;
  }
  clippyLog('bg', 'action:open_editor', { tabId: tab.id });
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_CLIP_EDITOR' });
  } catch (err) {
    clippyLog('bg', 'action:content_unavailable', { error: String(err) });
  }
}

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-clip-editor') return;
  clippyLog('bg', 'command:received', { command });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('youtube.com/watch')) {
    clippyLog('bg', 'command:skip', { url: tab?.url });
    return;
  }
  clippyLog('bg', 'command:open_editor', { tabId: tab.id });
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_CLIP_EDITOR' });
  } catch (err) {
    clippyLog('bg', 'command:fail', { error: String(err) });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'CREATE_CLIP') {
    const tabId = sender.tab?.id;
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
        clippyLog('bg', 'create_clip:fail', { error: String(err) });
        void notifyTabStatus(tabId, String(err?.message || err), {
          jobId: message.jobId,
          stage: 'error',
          variant: 'error',
          progress: 1,
        });
        sendResponse({ ok: false, error: String(err?.message || err) });
      });
    return true;
  }

  if (message?.type === 'GET_DEVICE_TOKEN') {
    getOrCreateDeviceToken()
      .then((token) => sendResponse({ ok: true, token }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message?.type === 'RESET_DEVICE_TOKEN') {
    chrome.storage.local
      .remove(DEVICE_TOKEN_KEY)
      .then(() => getOrCreateDeviceToken())
      .then((token) => sendResponse({ ok: true, token }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});
