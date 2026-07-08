const DEFAULT_CLIP_DURATION = 90;

/** @returns {HTMLVideoElement | null} */
function getVideo() {
  return document.querySelector('video.html5-main-video') ?? document.querySelector('video');
}

/** @returns {Promise<HTMLVideoElement | null>} */
function waitForVideo() {
  const existing = getVideo();
  if (!existing) return Promise.resolve(null);

  if (Number.isFinite(existing.duration) && existing.duration > 0) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    const done = () => {
      existing.removeEventListener('loadedmetadata', done);
      existing.removeEventListener('durationchange', done);
      resolve(Number.isFinite(existing.duration) && existing.duration > 0 ? existing : null);
    };

    existing.addEventListener('loadedmetadata', done);
    existing.addEventListener('durationchange', done);
    window.setTimeout(done, 2500);
  });
}

/** @param {EventTarget | null} target */
function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    target.isContentEditable ||
    Boolean(target.closest('#chat, ytd-live-chat-frame, .ytp-popup'))
  );
}

/**
 * Enqueue a clip job and process it without blocking the editor.
 * @param {{ start: number; end: number }} clip
 */
async function enqueueClipJob(clip) {
  const video = getVideo();
  const thumbUrl = captureVideoThumb(video);
  const job = clippyQueue.enqueue({
    start: clip.start,
    end: clip.end,
    thumbUrl,
  });

  clippyLog('content', 'queue:add', { id: job.id, start: clip.start, end: clip.end });

  try {
    clippyQueue.update(job.id, {
      status: 'queued',
      label: 'Démarrage…',
      progress: 0.05,
    });

    const result = await startClipRecording(clip, { jobId: job.id });

    clippyQueue.update(job.id, {
      status: 'done',
      label: 'Clip prêt',
      progress: 1,
      galleryUrl: result.galleryUrl,
    });
    clippyLog('content', 'queue:done', { id: job.id, galleryUrl: result.galleryUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    clippyLog('content', 'queue:fail', { id: job.id, error: message });
    clippyQueue.update(job.id, {
      status: 'error',
      label: 'Échec',
      error: message,
      progress: 1,
    });
  }
}

const editor = new ClipEditor({
  onSave(clip) {
    // Fire-and-forget: user can open editor again immediately for another clip
    void enqueueClipJob(clip);
  },
});

/** @type {ReturnType<typeof parseShortcut> | null} */
let activeShortcut = parseShortcut(globalThis.DEFAULT_SHORTCUT);
/** @type {string} */
let lastWatchUrl = window.location.href;

async function loadShortcut() {
  const { shortcut = globalThis.DEFAULT_SHORTCUT } = await chrome.storage.sync.get('shortcut');
  activeShortcut = parseShortcut(shortcut) ?? parseShortcut(globalThis.DEFAULT_SHORTCUT);
}

async function openClipEditor(options = {}) {
  clippyLog('content', 'openClipEditor', options);
  const video = await waitForVideo();
  if (!video) {
    clippyLog('content', 'openClipEditor:no_video');
    return;
  }

  const { clipDuration = DEFAULT_CLIP_DURATION } = await chrome.storage.sync.get('clipDuration');
  editor.open(video, clipDuration);

  notifyVideoActive();
  // Silent prefetch — no status chatter in the UI
  ensureSourceCached().then((result) => {
    if (result?.ok) {
      clippyLog('content', 'prefetch:ready', { bytes: result.bytes });
    }
  });
}

function onKeyDown(e) {
  if (!activeShortcut || !matchesShortcut(e, activeShortcut)) return;
  if (isEditableTarget(e.target)) return;

  e.preventDefault();
  e.stopPropagation();
  openClipEditor({ from: 'page_shortcut' });
}

function syncWatchPageLifecycle() {
  const url = window.location.href;
  const isWatch = url.includes('youtube.com/watch');

  if (isWatch) {
    if (url !== lastWatchUrl && lastWatchUrl.includes('youtube.com/watch')) {
      notifyVideoLeft(lastWatchUrl);
    }
    lastWatchUrl = url;
    notifyVideoActive(url);
  } else if (lastWatchUrl.includes('youtube.com/watch')) {
    notifyVideoLeft(lastWatchUrl);
    lastWatchUrl = url;
  }
}

/**
 * @param {{
 *   jobId?: string;
 *   stage?: string;
 *   label?: string;
 *   progress?: number;
 *   variant?: string;
 * }} message
 */
function handleJobProgress(message) {
  const { jobId, stage, label, progress } = message;
  if (!jobId) {
    if (typeof label === 'string') {
      showStatusBadge(label, { variant: message.variant === 'error' ? 'error' : 'default' });
    }
    return;
  }

  /** @type {'queued' | 'download' | 'crop' | 'upload' | 'done' | 'error' | undefined} */
  let status;
  if (stage === 'download') status = 'download';
  else if (stage === 'crop') status = 'crop';
  else if (stage === 'upload') status = 'upload';
  else if (stage === 'done') status = 'done';
  else if (stage === 'error') status = 'error';
  else if (stage === 'queued') status = 'queued';

  clippyQueue.update(jobId, {
    status,
    label: typeof label === 'string' ? label : undefined,
    progress: typeof progress === 'number' ? progress : undefined,
  });
}

loadShortcut();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.shortcut) {
    const next = changes.shortcut.newValue ?? globalThis.DEFAULT_SHORTCUT;
    activeShortcut = parseShortcut(next) ?? parseShortcut(globalThis.DEFAULT_SHORTCUT);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'OPEN_CLIP_EDITOR') {
    openClipEditor({ from: 'extension' });
    return;
  }

  if (message?.type === 'CLEAR_LOCAL_CACHES') {
    clearFilmstripCache?.();
    clippyLog('content', 'local_caches:cleared');
    return;
  }

  if (message?.type === 'CLIPPY_JOB_PROGRESS') {
    handleJobProgress(message);
    return;
  }

  if (message?.type === 'CLIPPY_STATUS' && typeof message.label === 'string') {
    // Legacy / prefetch without jobId
    if (message.jobId) {
      handleJobProgress(message);
      return;
    }
    showStatusBadge(message.label, {
      variant: message.variant === 'error' ? 'error' : 'default',
    });
  }
});

document.addEventListener('keydown', onKeyDown, true);
window.addEventListener('pagehide', () => notifyVideoLeft());
document.addEventListener('yt-navigate-finish', () => syncWatchPageLifecycle());
document.addEventListener('yt-page-data-updated', () => syncWatchPageLifecycle());

let lastHref = location.href;
const hrefObserver = new MutationObserver(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    syncWatchPageLifecycle();
  }
});
hrefObserver.observe(document.documentElement, { childList: true, subtree: true });

syncWatchPageLifecycle();
window.setInterval(() => {
  if (window.location.href.includes('youtube.com/watch')) {
    notifyVideoActive();
  }
}, 30 * 60 * 1000);
injectPlayerButton(() => openClipEditor({ from: 'player_button' }));
