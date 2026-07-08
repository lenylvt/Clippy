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

const editor = new ClipEditor({
  async onSave(clip) {
    clippyLog('content', 'onSave', {
      start: clip.start,
      end: clip.end,
    });

    try {
      await startClipRecording(clip);
      clippyLog('content', 'onSave:done', { start: clip.start, end: clip.end });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Clippy] enregistrement échoué — ${message}`);
    }
  },
});

/** @type {ReturnType<typeof parseShortcut> | null} */
let activeShortcut = parseShortcut(DEFAULT_SHORTCUT);

async function loadShortcut() {
  const { shortcut = DEFAULT_SHORTCUT } = await chrome.storage.sync.get('shortcut');
  activeShortcut = parseShortcut(shortcut) ?? parseShortcut(DEFAULT_SHORTCUT);
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
}

function onKeyDown(e) {
  if (!activeShortcut || !matchesShortcut(e, activeShortcut)) return;
  if (isEditableTarget(e.target)) return;

  e.preventDefault();
  e.stopPropagation();
  openClipEditor({ from: 'page_shortcut' });
}

loadShortcut();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.shortcut) {
    const next = changes.shortcut.newValue ?? DEFAULT_SHORTCUT;
    activeShortcut = parseShortcut(next) ?? parseShortcut(DEFAULT_SHORTCUT);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'OPEN_CLIP_EDITOR') {
    openClipEditor({ from: 'extension' });
  }
});

document.addEventListener('keydown', onKeyDown, true);
injectPlayerButton(() => openClipEditor({ from: 'player_button' }));
