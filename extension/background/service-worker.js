importScripts(
  '../lib/log.js',
  '../lib/config.js',
  '../lib/clip-constants.js',
  '../lib/filename.js',
  '../lib/youtube.js',
  '../lib/ytdl.js',
  '../lib/video-cache.js',
  '../lib/upload.js',
);

const OFFSCREEN_URL = 'offscreen/offscreen.html';
const CLEANUP_ALARM = 'clippy-cache-cleanup';
/** @type {Map<string, Promise<CachedVideo>>} */
const downloadInflight = new Map();
/** @type {Map<number, string>} tabId → videoId currently open */
const tabVideoIds = new Map();
/** Serialize ffmpeg crops (single offscreen instance). */
let cropChain = Promise.resolve();

/**
 * @param {number | undefined} tabId
 * @param {string} label
 * @param {{ variant?: 'default' | 'error'; jobId?: string; stage?: string; progress?: number }} [options]
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
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function enqueueCrop(fn) {
  const run = cropChain.then(fn, fn);
  cropChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL(OFFSCREEN_URL);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url],
  });
  if (contexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['WORKERS'],
      justification: 'Découper les vidéos YouTube mises en cache avec ffmpeg',
    });
  }

  // Wait until the offscreen listener is ready (cold start).
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const pong = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_PING' });
      if (pong?.ok) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * @param {{ videoId: string; start: number; end: number; resultKey: string }} payload
 */
async function requestOffscreenCrop(payload) {
  await ensureOffscreenDocument();
  const cropResponse = await chrome.runtime.sendMessage({
    type: 'OFFSCREEN_CROP',
    ...payload,
  });
  if (!cropResponse?.ok) {
    throw new Error(cropResponse?.error ?? 'crop_failed');
  }
  return cropResponse;
}

/**
 * @param {string} videoId
 * @param {string} youtubeUrl
 * @param {number} [tabId]
 * @param {string} [jobId]
 * @returns {Promise<CachedVideo>}
 */
async function ensureVideoCached(videoId, youtubeUrl, tabId, jobId) {
  const existing = await getCachedVideo(videoId);
  if (existing?.blob?.size > 10_000) {
    await markVideoActive(videoId, youtubeUrl);
    clippyLog('bg', 'cache:hit', { videoId, bytes: existing.blob.size });
    return /** @type {CachedVideo} */ (await getCachedVideo(videoId));
  }

  const inflight = downloadInflight.get(videoId);
  if (inflight) {
    await notifyTabStatus(tabId, 'Téléchargement en cours…', {
      jobId,
      stage: 'download',
      progress: 0.15,
    });
    return inflight;
  }

  const promise = (async () => {
    await notifyTabStatus(tabId, 'Téléchargement 1080p…', {
      jobId,
      stage: 'download',
      progress: 0.12,
    });
    clippyLog('bg', 'cache:download:start', { videoId });

    const blob = await downloadYtdlVideo(youtubeUrl, { fmt: YTDL_DEFAULT_FMT });

    const record = await putCachedVideo({
      videoId,
      youtubeUrl,
      blob,
      leftAt: null,
      lastActiveAt: Date.now(),
    });

    clippyLog('bg', 'cache:download:done', { videoId, bytes: blob.size });
    return record;
  })().finally(() => {
    downloadInflight.delete(videoId);
  });

  downloadInflight.set(videoId, promise);
  return promise;
}

/**
 * @param {{
 *   videoId: string;
 *   youtubeUrl: string;
 *   start: number;
 *   end: number;
 *   videoTitle: string;
 *   tabId?: number;
 *   jobId?: string;
 * }} input
 */
async function createClipFromCache(input) {
  const { videoId, youtubeUrl, start, end, videoTitle, tabId, jobId } = input;
  const clipDuration = end - start;
  if (clipDuration > MAX_CLIP_SECONDS) {
    throw new Error('clip_too_long');
  }
  if (clipDuration < MIN_CLIP_SECONDS) {
    throw new Error('clip_too_short');
  }

  await notifyTabStatus(tabId, 'Vérification du cache…', {
    jobId,
    stage: 'download',
    progress: 0.08,
  });
  await ensureVideoCached(videoId, youtubeUrl, tabId, jobId);

  await notifyTabStatus(tabId, 'Découpe du clip…', {
    jobId,
    stage: 'crop',
    progress: 0.4,
  });

  const resultKey = `clip-tmp:${videoId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  await enqueueCrop(() => requestOffscreenCrop({ videoId, start, end, resultKey }));

  const clipBlob = await takeTempBlob(resultKey);
  if (!clipBlob) {
    throw new Error('crop_result_missing');
  }

  const safeTitle = sanitizeFilename(videoTitle).replace(/\.+$/g, '');
  const filename = `clippy-${safeTitle}.mp4`;
  const { workerUrl = CLIPPY_DEFAULT_WORKER_URL } = await chrome.storage.sync.get('workerUrl');
  if (!workerUrl) {
    throw new Error('missing_worker_url');
  }

  await notifyTabStatus(tabId, 'Envoi du clip…', {
    jobId,
    stage: 'upload',
    progress: 0.75,
  });
  const result = await uploadClip(
    {
      blob: clipBlob,
      filename,
      videoId,
      videoTitle,
      youtubeUrl,
      clipStart: start,
      clipEnd: end,
    },
    workerUrl,
  );

  await notifyTabStatus(tabId, 'Clip prêt', {
    jobId,
    stage: 'done',
    progress: 1,
  });

  clippyLog('bg', 'clip:upload:done', { id: result.id, galleryUrl: result.galleryUrl, jobId });
  return result;
}

/** @param {chrome.tabs.Tab} tab */
async function openEditorOnTab(tab) {
  if (!tab.id || !tab.url?.includes('youtube.com/watch')) {
    clippyLog('bg', 'open_editor:skip', { url: tab.url });
    return;
  }

  clippyLog('bg', 'action:open_editor', { tabId: tab.id });

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_CLIP_EDITOR' });
  } catch (error) {
    clippyLog('bg', 'action:content_unavailable', {
      tabId: tab.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

async function openEditorOnActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('youtube.com/watch')) {
    clippyLog('bg', 'command:skip', { url: tab?.url });
    return;
  }

  clippyLog('bg', 'command:open_editor', { tabId: tab.id });
  await openEditorOnTab(tab);
}

/**
 * @param {string} videoId
 * @param {number} tabId
 */
function trackVideoActive(videoId, tabId) {
  const previous = tabVideoIds.get(tabId);
  tabVideoIds.set(tabId, videoId);
  // If this tab switched videos, the previous one may need a leave mark.
  if (previous && previous !== videoId && !isVideoActiveAnywhere(previous)) {
    markVideoLeft(previous).catch(() => {});
  }
}

/**
 * @param {string} videoId
 * @returns {boolean}
 */
function isVideoActiveAnywhere(videoId) {
  for (const id of tabVideoIds.values()) {
    if (id === videoId) return true;
  }
  return false;
}

/**
 * @param {number} tabId
 * @param {string} [videoId]
 */
async function trackVideoLeft(tabId, videoId) {
  const mapped = tabVideoIds.get(tabId) || videoId;
  tabVideoIds.delete(tabId);

  if (!mapped) return;

  if (!isVideoActiveAnywhere(mapped)) {
    await markVideoLeft(mapped);
    clippyLog('bg', 'cache:left', { videoId: mapped, tabId });
  }
}

async function openCachePage() {
  const url = chrome.runtime.getURL('cache/cache.html');
  const existing = await chrome.tabs.query({ url });
  if (existing[0]?.id) {
    await chrome.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId != null) {
      await chrome.windows.update(existing[0].windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url });
}

/**
 * Clear every cache layer Clippy owns.
 * @returns {Promise<{
 *   ok: true;
 *   deleted: number;
 *   freedBytes: number;
 *   tabsNotified: number;
 * }>}
 */
async function clearAllCaches() {
  downloadInflight.clear();

  const { deleted, freedBytes } = await clearAllCachedVideos();

  // Drop ffmpeg MEMFS source if offscreen is alive
  try {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({ type: 'OFFSCREEN_RESET_SOURCE' });
  } catch {
    /* offscreen may not exist */
  }

  // Filmstrip + any in-page caches on YouTube tabs
  const ytTabs = await chrome.tabs.query({ url: ['*://www.youtube.com/*', '*://youtube.com/*'] });
  let tabsNotified = 0;
  await Promise.all(
    ytTabs.map(async (tab) => {
      if (!tab.id) return;
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_LOCAL_CACHES' });
        tabsNotified += 1;
      } catch {
        /* content script not injected */
      }
    }),
  );

  clippyLog('bg', 'cache:clear_all', { deleted, freedBytes, tabsNotified });
  return { ok: true, deleted, freedBytes, tabsNotified };
}

chrome.action.onClicked.addListener(async () => {
  await openCachePage();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-clip-editor') return;
  await openEditorOnActiveTab();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return;

  // Offscreen messages are handled by the offscreen page only.
  if (
    message.type === 'OFFSCREEN_CROP' ||
    message.type === 'OFFSCREEN_PING' ||
    message.type === 'OFFSCREEN_RESET_SOURCE'
  ) {
    return;
  }

  const tabId = sender.tab?.id;

  if (message.type === 'LIST_CACHE') {
    listCachedVideoMeta()
      .then((entries) => {
        const totalBytes = entries.reduce((sum, e) => sum + (e.size || 0), 0);
        sendResponse({
          ok: true,
          entries,
          totalBytes,
          ttlMs: VIDEO_CACHE_TTL_MS,
        });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (message.type === 'DELETE_CACHE_ENTRY') {
    const { videoId } = message;
    if (!videoId) {
      sendResponse({ ok: false, error: 'missing_video_id' });
      return;
    }
    deleteCachedVideo(videoId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (message.type === 'CLEAR_ALL_CACHES') {
    clearAllCaches()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (message.type === 'VIDEO_ACTIVE') {
    const { videoId, youtubeUrl } = message;
    if (videoId && tabId != null) {
      trackVideoActive(videoId, tabId);
      markVideoActive(videoId, youtubeUrl).catch(() => {});
    }
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'VIDEO_LEFT') {
    const { videoId } = message;
    if (tabId != null) {
      trackVideoLeft(tabId, videoId).then(() => sendResponse({ ok: true })).catch((error) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
      return true;
    }
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'ENSURE_VIDEO_CACHE') {
    const { videoId, youtubeUrl } = message;
    if (!videoId || !youtubeUrl) {
      sendResponse({ ok: false, error: 'missing_params' });
      return;
    }

    if (tabId != null) trackVideoActive(videoId, tabId);

    ensureVideoCached(videoId, youtubeUrl, tabId)
      .then((entry) => sendResponse({ ok: true, bytes: entry.blob.size }))
      .catch((error) => {
        const err = error instanceof Error ? error.message : String(error);
        clippyLog('bg', 'cache:ensure:fail', { videoId, error: err });
        sendResponse({ ok: false, error: err });
      });
    return true;
  }

  if (message.type === 'CREATE_CLIP') {
    const { videoId, youtubeUrl, start, end, videoTitle, jobId } = message;
    if (!videoId || !youtubeUrl || typeof start !== 'number' || typeof end !== 'number') {
      sendResponse({ ok: false, error: 'missing_params' });
      return;
    }

    if (tabId != null) trackVideoActive(videoId, tabId);

    createClipFromCache({
      videoId,
      youtubeUrl,
      start,
      end,
      videoTitle: videoTitle || 'clip',
      tabId,
      jobId: typeof jobId === 'string' ? jobId : undefined,
    })
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => {
        const err = error instanceof Error ? error.message : String(error);
        clippyLog('bg', 'clip:fail', { videoId, error: err, jobId });
        notifyTabStatus(tabId, 'Échec du clip', {
          variant: 'error',
          jobId: typeof jobId === 'string' ? jobId : undefined,
          stage: 'error',
          progress: 1,
        });
        sendResponse({ ok: false, error: err });
      });
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  trackVideoLeft(tabId).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && !changeInfo.url.includes('youtube.com/watch')) {
    trackVideoLeft(tabId).catch(() => {});
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== CLEANUP_ALARM) return;
  try {
    const deleted = await purgeExpiredVideos(Date.now());
    if (deleted.length) {
      clippyLog('bg', 'cache:purge', { deleted });
    }
  } catch (error) {
    clippyLog('bg', 'cache:purge:fail', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(CLEANUP_ALARM, { periodInMinutes: 60 });
});

chrome.alarms.create(CLEANUP_ALARM, { periodInMinutes: 60 });

clippyLog('bg', 'ready');
