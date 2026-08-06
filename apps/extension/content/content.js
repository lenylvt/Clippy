/** Durée clip par défaut — source unique : `lib/clip-constants.js` → globalThis. */
const WAIT_VIDEO_TIMEOUT_MS = 8000;
const MAIN_VIDEO_SELECTOR = '#movie_player video.html5-main-video';

function defaultClipDuration() {
  const v = globalThis.DEFAULT_CLIP_DURATION;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 90;
}

/** @type {Map<string, string>} */
const CLIP_ERROR_LABELS = new Map([
  ['pairing_required', 'Relie l’app (réglages → QR)'],
  ['clip_too_long', 'Clip trop long'],
  ['clip_too_short', 'Clip trop court'],
  ['missing_video_id', 'Vidéo introuvable'],
  ['invalid_clip_range', 'Plage de clip invalide'],
  ['create_clip_failed', 'Échec de création'],
  ['sw_no_response', 'Extension indisponible — recharge la page'],
  ['sw_unreachable', 'Extension indisponible — recharge la page'],
  ['extension_context_invalidated', 'Recharge la page'],
  ['missing_worker_url', 'Configure l’URL worker (réglages)'],
  ['job_timeout', 'Délai dépassé'],
  ['job_failed', 'Échec'],
]);

const QUEUE_UI_STATUSES = new Set([
  'queued',
  'preparing',
  'download',
  'crop',
  'upload',
  'done',
  'error',
]);

/** @type {{ videoId: string; youtubeUrl: string; videoTitle: string } | null} */
let editorSession = null;

/** @type {Promise<void> | null} */
let openInFlight = null;

/** @type {ReturnType<typeof injectPlayerButton> | null} */
let playerButtonApi = null;

/** @type {(() => void) | null} */
let teardownNavigation = null;

/**
 * @param {string} code
 * @returns {string}
 */
function labelForClipError(code) {
  if (CLIP_ERROR_LABELS.has(code)) return /** @type {string} */ (CLIP_ERROR_LABELS.get(code));
  // Libellé déjà humain (FR du SW) — ne pas écraser
  if (code && /[^a-z0-9_]/.test(code)) return code;
  return 'Échec';
}

/**
 * @param {unknown} variant
 * @returns {'default' | 'error'}
 */
function badgeVariant(variant) {
  return variant === 'error' ? 'error' : 'default';
}

/**
 * Map stage serveur ou UI → statut queue (idempotent).
 * @param {string} [stage]
 * @returns {ClipQueueJob['status'] | undefined}
 */
function queueStatusFromStage(stage) {
  if (typeof stage !== 'string' || !stage) return undefined;
  if (QUEUE_UI_STATUSES.has(stage)) {
    return /** @type {ClipQueueJob['status']} */ (stage);
  }
  const map =
    typeof globalThis.stageToQueueStatus === 'function'
      ? globalThis.stageToQueueStatus
      : null;
  if (!map) return undefined;
  const mapped = map(stage);
  if (!QUEUE_UI_STATUSES.has(mapped)) return undefined;
  return /** @type {ClipQueueJob['status']} */ (mapped);
}

/** @returns {HTMLVideoElement | null} */
function getVideo() {
  const main = document.querySelector(MAIN_VIDEO_SELECTOR);
  if (!main || main.tagName !== 'VIDEO') return null;
  return /** @type {HTMLVideoElement} */ (main);
}

/**
 * Live / DVR sans durée connue — pas les VOD (même si un badge live traîne dans le DOM).
 * @param {HTMLVideoElement | null} video
 * @returns {boolean}
 */
function isLiveVideo(video) {
  if (!video) return false;
  // Durée finie = VOD (premiere terminée, replay, etc.) — jamais « live ».
  if (Number.isFinite(video.duration) && video.duration > 0) return false;
  if (video.duration === Infinity) return true;
  // Durée encore inconnue : badge live visible seulement.
  try {
    const badge = document.querySelector('.ytp-live-badge');
    if (!badge || badge.hasAttribute('disabled')) return false;
    const style = window.getComputedStyle(badge);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    // offsetParent null ≈ hors flux / hidden via ancestor
    if (badge.getClientRects().length === 0) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {HTMLVideoElement | null} video
 * @returns {boolean}
 */
function isVideoReady(video) {
  return Boolean(
    video &&
      video.isConnected &&
      Number.isFinite(video.duration) &&
      video.duration > 0,
  );
}

/**
 * Attend la vidéo principale dans le DOM + metadata (SPA YouTube).
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<HTMLVideoElement | null>}
 */
function waitForVideo(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? WAIT_VIDEO_TIMEOUT_MS;

  return new Promise((resolve) => {
    let settled = false;
    /** @type {MutationObserver | null} */
    let observer = null;
    /** @type {HTMLVideoElement | null} */
    let listening = null;
    /** @type {number} */
    let pollTimer = 0;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(pollTimer);
      observer?.disconnect();
      observer = null;
      document.removeEventListener('yt-navigate-finish', onNavigate);
      detachVideoListeners();
    };

    const finish = (/** @type {HTMLVideoElement | null} */ video) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(video);
    };

    const onMeta = () => {
      const video = getVideo();
      if (isLiveVideo(video)) {
        finish(video);
        return;
      }
      if (isVideoReady(video)) finish(video);
    };

    const detachVideoListeners = () => {
      if (!listening) return;
      listening.removeEventListener('loadedmetadata', onMeta);
      listening.removeEventListener('durationchange', onMeta);
      listening = null;
    };

    const attachVideoListeners = (/** @type {HTMLVideoElement} */ video) => {
      if (listening === video) return;
      detachVideoListeners();
      listening = video;
      video.addEventListener('loadedmetadata', onMeta);
      video.addEventListener('durationchange', onMeta);
    };

    const check = () => {
      const video = getVideo();
      if (!video) {
        detachVideoListeners();
        return;
      }
      if (!video.isConnected) {
        detachVideoListeners();
        return;
      }
      if (isLiveVideo(video) || isVideoReady(video)) {
        finish(video);
        return;
      }
      attachVideoListeners(video);
    };

    const onNavigate = () => check();

    const timeoutId = window.setTimeout(() => {
      const video = getVideo();
      if (isLiveVideo(video) || isVideoReady(video)) finish(video);
      else finish(null);
    }, timeoutMs);

    document.addEventListener('yt-navigate-finish', onNavigate);

    observer = new MutationObserver(() => check());
    const root =
      document.querySelector('#movie_player') ||
      document.querySelector('#ytd-player') ||
      document.documentElement;
    observer.observe(root, { childList: true, subtree: true });

    pollTimer = window.setInterval(check, 250);
    check();
  });
}

/**
 * @param {number | unknown} value
 * @returns {number}
 */
function resolveClipDuration(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : defaultClipDuration();
}

/**
 * Applique un état terminal seulement si le SW n’a pas déjà gagné.
 * @param {string} jobId
 * @param {{
 *   status: ClipQueueJob['status'];
 *   label: string;
 *   progress: number;
 *   error?: string;
 *   url?: string;
 * }} patch
 */
function applyJobTerminal(jobId, patch) {
  const current = clippyQueue.jobs.find((j) => j.id === jobId);
  if (!current) return;
  if (current.status === 'done' || current.status === 'error') return;
  clippyQueue.update(jobId, patch);
}

/**
 * @param {{ start: number; end: number }} clip
 * @param {{ videoId: string; youtubeUrl: string; videoTitle: string } | null} session
 */
async function enqueueClipJob(clip, session) {
  const videoId = session?.videoId || getYoutubeVideoId(window.location.href);
  const youtubeUrl =
    session?.youtubeUrl ||
    (videoId ? canonicalYoutubeWatchUrl(videoId) : window.location.href);
  const videoTitle =
    session?.videoTitle ||
    (typeof globalThis.cleanYoutubeTitle === 'function'
      ? globalThis.cleanYoutubeTitle(document.title)
      : String(document.title || '').trim()) ||
    'clip';

  const ytThumb = videoId ? youtubeThumbUrl(videoId, 'mq') || undefined : undefined;
  const video = getVideo();
  const thumbUrl = captureVideoThumb(video, ytThumb);

  const job = clippyQueue.enqueue({
    start: clip.start,
    end: clip.end,
    thumbUrl,
  });

  clippyLog('content', 'queue:add', {
    id: job.id,
    start: clip.start,
    end: clip.end,
    videoId,
  });

  try {
    // SW (poll legacy ou ack-only) pousse CLIPPY_JOB_PROGRESS → source de vérité UI.
    // Le await sert de fallback terminal si le SW répond encore de façon synchrone.
    const result = await startClipJob(clip, {
      jobId: job.id,
      videoId,
      youtubeUrl,
      videoTitle,
    });

    if (result?.url) {
      applyJobTerminal(job.id, {
        status: 'done',
        label: 'Terminé',
        progress: 1,
        url: result.url,
      });
    }
    clippyLog('content', 'queue:ack', { id: job.id, url: result?.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const label = labelForClipError(message);
    clippyLog('content', 'queue:fail', { id: job.id, error: message });
    applyJobTerminal(job.id, {
      status: 'error',
      label,
      error: message,
      progress: 1,
    });
    showStatusBadge(label, { variant: 'error' });
  }
}

/** @type {InstanceType<typeof ClipEditor> | null} */
let editor = null;

function getEditor() {
  if (!editor) {
    editor = new ClipEditor({
      onSave(clips) {
        const session = editorSession;
        const list = Array.isArray(clips) ? clips : [clips];
        for (const clip of list) {
          void enqueueClipJob(clip, session);
        }
      },
    });
  }
  return editor;
}

function syncPlayerButtonState() {
  playerButtonApi?.setOpen(Boolean(editor?.isOpen));
}

function closeEditorForNavigation() {
  if (editor?.isOpen) {
    clippyLog('content', 'nav:close_editor');
    editor.close();
  }
  editorSession = null;
  syncPlayerButtonState();
}

/**
 * Clear filmstrip cache only when leaving a video (not on every SPA flicker).
 * @param {string | null} prevId
 * @param {string | null} nextId
 */
function clearFilmstripIfVideoChanged(prevId, nextId) {
  if (prevId && nextId && prevId === nextId) return;
  clearFilmstripCache?.();
}

/**
 * @param {{ from?: string }} [options]
 */
async function openClipEditor(options = {}) {
  if (openInFlight) return openInFlight;

  openInFlight = (async () => {
    clippyLog('content', 'openClipEditor', options);
    const ed = getEditor();

    // Toggle close uniquement si déjà ouvert (pas pendant un open en cours — mutex).
    if (ed.isOpen) {
      ed.close();
      editorSession = null;
      syncPlayerButtonState();
      return;
    }

    const video = await waitForVideo();
    const resolved = getVideo();
    const active = resolved && resolved.isConnected ? resolved : video;

    if (!active || !active.isConnected) {
      clippyLog('content', 'openClipEditor:no_video');
      showStatusBadge('Vidéo indisponible', { variant: 'error' });
      return;
    }

    if (isLiveVideo(active)) {
      clippyLog('content', 'openClipEditor:live');
      showStatusBadge('Lives non supportés', { variant: 'error' });
      return;
    }

    if (!isVideoReady(active)) {
      clippyLog('content', 'openClipEditor:no_duration');
      showStatusBadge('Vidéo indisponible', { variant: 'error' });
      return;
    }

    const stored = await chrome.storage.sync.get('clipDuration');
    const clipDuration = resolveClipDuration(stored?.clipDuration);

    // Re-resolve après await storage (SPA peut avoir remplacé le nœud).
    const fresh = getVideo();
    if (!isVideoReady(fresh) || isLiveVideo(fresh)) {
      clippyLog('content', 'openClipEditor:stale_video');
      showStatusBadge(
        isLiveVideo(fresh) ? 'Lives non supportés' : 'Vidéo indisponible',
        { variant: 'error' },
      );
      return;
    }

    const videoId = getYoutubeVideoId(window.location.href);
    if (!videoId) {
      showStatusBadge('Vidéo introuvable', { variant: 'error' });
      return;
    }

    editorSession = {
      videoId,
      youtubeUrl: canonicalYoutubeWatchUrl(videoId),
      videoTitle:
        (typeof globalThis.cleanYoutubeTitle === 'function'
          ? globalThis.cleanYoutubeTitle(document.title)
          : String(document.title || '').replace(/\s*-\s*YouTube\s*$/i, '').trim()) || 'clip',
    };

    ed.open(fresh, clipDuration);
    syncPlayerButtonState();
  })().finally(() => {
    openInFlight = null;
  });

  return openInFlight;
}

/**
 * @param {{
 *   jobId?: string;
 *   stage?: string;
 *   label?: string;
 *   progress?: number;
 *   variant?: string;
 *   url?: string;
 * }} message
 */
function handleJobProgress(message) {
  const { jobId, stage, label, progress, url } = message;
  if (!jobId) {
    if (typeof label === 'string') {
      showStatusBadge(label, { variant: badgeVariant(message.variant) });
    }
    return;
  }

  const status = queueStatusFromStage(stage);
  /** @type {{ status?: string; label?: string; progress?: number; url?: string; error?: string }} */
  const patch = {
    status,
    label: typeof label === 'string' ? label : undefined,
    progress: typeof progress === 'number' ? progress : undefined,
    url: typeof url === 'string' ? url : undefined,
  };

  if (status === 'error') {
    const raw =
      (typeof label === 'string' && label) ||
      (typeof message.error === 'string' && message.error) ||
      '';
    if (raw) {
      patch.label = labelForClipError(raw);
      if (/^[a-z0-9_]+$/i.test(raw)) patch.error = raw;
    }
  }

  clippyQueue.update(jobId, patch);
}

function bindYoutubeNavigation() {
  if (teardownNavigation) return;

  let lastVideoId = getYoutubeVideoId(window.location.href);

  const onNavStart = () => {
    closeEditorForNavigation();
  };

  const onNav = () => {
    const nextId = getYoutubeVideoId(window.location.href);
    if (nextId !== lastVideoId) {
      clearFilmstripIfVideoChanged(lastVideoId, nextId);
      lastVideoId = nextId;
      closeEditorForNavigation();
    } else if (editor?.isOpen && editorSession && nextId && nextId !== editorSession.videoId) {
      clearFilmstripIfVideoChanged(editorSession.videoId, nextId);
      closeEditorForNavigation();
    }
  };

  document.addEventListener('yt-navigate-start', onNavStart);
  document.addEventListener('yt-navigate-finish', onNav);
  window.addEventListener('popstate', onNav);

  teardownNavigation = () => {
    document.removeEventListener('yt-navigate-start', onNavStart);
    document.removeEventListener('yt-navigate-finish', onNav);
    window.removeEventListener('popstate', onNav);
    teardownNavigation = null;
  };
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function openEditorFailureLabel(err) {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (/Extension context invalidated/i.test(raw)) {
    return 'Recharge la page';
  }
  if (/cleanYoutubeTitle is not defined/i.test(raw)) {
    return 'Extension incomplète — recharge Clippy';
  }
  return 'Impossible d’ouvrir Clippy';
}

function bootContentScript() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'OPEN_CLIP_EDITOR') {
      void openClipEditor({ from: 'extension' }).catch((err) => {
        clippyLog('content', 'openClipEditor:reject', { error: String(err) });
        showStatusBadge(openEditorFailureLabel(err), { variant: 'error' });
      });
      return;
    }

    if (message?.type === 'CLIPPY_JOB_PROGRESS') {
      handleJobProgress(message);
      return;
    }

    if (message?.type === 'CLIPPY_STATUS' && typeof message.label === 'string') {
      if (message.jobId) {
        handleJobProgress(message);
        return;
      }
      showStatusBadge(message.label, {
        variant: badgeVariant(message.variant),
      });
    }
  });

  bindYoutubeNavigation();

  playerButtonApi = injectPlayerButton(() => {
    void openClipEditor({ from: 'player_button' }).catch((err) => {
      clippyLog('content', 'openClipEditor:reject', { error: String(err) });
      showStatusBadge(openEditorFailureLabel(err), { variant: 'error' });
    });
  });
}

if (
  typeof chrome !== 'undefined' &&
  chrome?.runtime?.onMessage &&
  typeof ClipEditor === 'function' &&
  typeof injectPlayerButton === 'function'
) {
  bootContentScript();
}

globalThis.waitForVideo = waitForVideo;
globalThis.getVideo = getVideo;
globalThis.isLiveVideo = isLiveVideo;
globalThis.isVideoReady = isVideoReady;
globalThis.labelForClipError = labelForClipError;
globalThis.queueStatusFromStage = queueStatusFromStage;
globalThis.resolveClipDuration = resolveClipDuration;
globalThis.openClipEditor = openClipEditor;
globalThis.handleJobProgress = handleJobProgress;
globalThis.bootContentScript = bootContentScript;
globalThis.openEditorFailureLabel = openEditorFailureLabel;
