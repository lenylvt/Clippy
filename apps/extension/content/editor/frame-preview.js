/**
 * @param {HTMLVideoElement} video
 * @param {HTMLCanvasElement} canvas
 */
function paintEditorPreviewCanvas(video, canvas) {
  if (video.readyState < 2) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

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
 *   video: HTMLVideoElement;
 *   duration: number;
 *   time: number;
 *   handle: 'left' | 'right' | null;
 *   schedulePaint: (canvas: HTMLCanvasElement) => void;
 * }} opts
 */
function showEditorFramePreview(opts) {
  const { root, video: _video, duration, time, handle, schedulePaint } = opts;
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
  let x = rect.left + ratio * rect.width;
  const previewW = 160;
  x = clamp(x, rect.left + previewW / 2, rect.right - previewW / 2);

  preview.hidden = false;
  preview.style.left = `${x}px`;
  preview.style.top = `${rect.top - 8}px`;
  preview.dataset.handle = handle || '';
  timeEl.textContent = formatDuration(time);
  schedulePaint(canvas);
}

/**
 * @param {HTMLElement | null | undefined} root
 */
function hideEditorFramePreview(root) {
  const preview = root?.querySelector('[data-frame-preview]');
  if (preview instanceof HTMLElement) preview.hidden = true;
}

/**
 * @param {{
 *   root: HTMLElement;
 *   video: HTMLVideoElement;
 *   clipStart: number;
 *   clipEnd: number;
 *   dragMode: 'left' | 'right' | 'move' | 'playhead' | null;
 *   showAt: (time: number, handle: 'left' | 'right' | null) => void;
 * }} opts
 */
function updateEditorFramePreview(opts) {
  const { video, clipStart, clipEnd, dragMode, showAt } = opts;
  if (!dragMode) return;
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
globalThis.updateEditorFramePreview = updateEditorFramePreview;
