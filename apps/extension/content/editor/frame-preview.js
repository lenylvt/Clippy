/** @type {WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>} */
const previewCtxCache = new WeakMap();

/**
 * @param {HTMLVideoElement} video
 * @param {HTMLCanvasElement} canvas
 * @param {number} [expectedTime]
 */
function paintEditorPreviewCanvas(video, canvas, expectedTime) {
  if (video.readyState < 2) return;
  if (typeof expectedTime === 'number' && Math.abs(video.currentTime - expectedTime) > 0.35) {
    return;
  }

  let ctx = previewCtxCache.get(canvas);
  if (!ctx) {
    const next = canvas.getContext('2d');
    if (!next) return;
    previewCtxCache.set(canvas, next);
    ctx = next;
  }

  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const maxW = 160;
  const maxH = 90;
  const scale = Math.min(maxW / vw, maxH / vh);
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  try {
    ctx.drawImage(video, 0, 0, w, h);
  } catch {
    /* ignore */
  }
}

/**
 * @param {{
 *   root: HTMLElement;
 *   duration: number;
 *   time: number;
 *   handle: 'left' | 'right' | null;
 *   schedulePaint: (canvas: HTMLCanvasElement, time: number) => void;
 * }} opts
 */
function showEditorFramePreview(opts) {
  const { root, duration, time, handle, schedulePaint } = opts;
  const preview = root.querySelector('[data-frame-preview]');
  const canvas = root.querySelector('[data-preview-canvas]');
  const timeEl = root.querySelector('[data-preview-time]');
  const track = root.querySelector('[data-track]');
  if (
    !(preview instanceof HTMLElement) ||
    !(canvas instanceof HTMLCanvasElement) ||
    !(timeEl instanceof HTMLElement) ||
    !(track instanceof HTMLElement)
  ) {
    return;
  }

  const rect = track.getBoundingClientRect();
  const ratio = duration > 0 ? clamp(time / duration, 0, 1) : 0;
  const previewW = preview.offsetWidth || canvas.offsetWidth || 160;
  let x = rect.left + ratio * rect.width;
  x = clamp(x, rect.left + previewW / 2, rect.right - previewW / 2);

  const preferBelow = rect.top < 100;
  preview.hidden = false;
  preview.classList.toggle('clippy-frame-preview--below', preferBelow);
  preview.style.left = `${x}px`;
  preview.style.top = preferBelow ? `${rect.bottom + 8}px` : `${rect.top - 8}px`;

  if (handle) {
    preview.dataset.handle = handle;
  } else {
    delete preview.dataset.handle;
  }

  timeEl.textContent = formatScrubDuration(time);
  schedulePaint(canvas, time);
}

/**
 * @param {HTMLElement | null | undefined} root
 */
function hideEditorFramePreview(root) {
  const preview = root?.querySelector('[data-frame-preview]');
  if (preview instanceof HTMLElement) {
    preview.hidden = true;
    preview.classList.remove('clippy-frame-preview--below');
    delete preview.dataset.handle;
  }
}

/**
 * Reposition an already-visible preview (resize / scroll).
 * @param {{
 *   root: HTMLElement;
 *   duration: number;
 *   time: number;
 *   handle: 'left' | 'right' | null;
 * }} opts
 */
function repositionEditorFramePreview(opts) {
  const preview = opts.root.querySelector('[data-frame-preview]');
  if (!(preview instanceof HTMLElement) || preview.hidden) return;
  showEditorFramePreview({
    ...opts,
    schedulePaint: () => {},
  });
}

/**
 * @param {{
 *   root: HTMLElement;
 *   video: HTMLVideoElement;
 *   clipStart: number;
 *   clipEnd: number;
 *   dragMode: 'left' | 'right' | 'playhead' | null;
 *   showAt: (time: number, handle: 'left' | 'right' | null) => void;
 * }} opts
 */
function updateEditorFramePreview(opts) {
  const { video, clipStart, clipEnd, dragMode, showAt } = opts;
  // 'move' preview is owned by timeline (region center); skip here.
  if (!dragMode || dragMode === 'move') return;
  if (dragMode === 'left') {
    showAt(clipStart, 'left');
  } else if (dragMode === 'right') {
    showAt(clipEnd, 'right');
  } else if (dragMode === 'playhead') {
    showAt(video.currentTime, null);
  }
}

globalThis.paintEditorPreviewCanvas = paintEditorPreviewCanvas;
globalThis.showEditorFramePreview = showEditorFramePreview;
globalThis.hideEditorFramePreview = hideEditorFramePreview;
globalThis.repositionEditorFramePreview = repositionEditorFramePreview;
globalThis.updateEditorFramePreview = updateEditorFramePreview;
