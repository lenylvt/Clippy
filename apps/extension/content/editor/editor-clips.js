/** Distinct colors for editable draft clips on the timeline. */
const EDITOR_CLIP_COLORS = [
  { fill: 'rgba(255, 0, 51, 0.32)', border: '#ff0033', handle: '#ff0033' },
  { fill: 'rgba(62, 166, 255, 0.32)', border: '#3ea6ff', handle: '#3ea6ff' },
  { fill: 'rgba(46, 164, 79, 0.32)', border: '#2ea44f', handle: '#2ea44f' },
  { fill: 'rgba(255, 167, 38, 0.32)', border: '#ffa726', handle: '#ffa726' },
  { fill: 'rgba(187, 134, 252, 0.32)', border: '#bb86fc', handle: '#bb86fc' },
  { fill: 'rgba(0, 188, 212, 0.32)', border: '#00bcd4', handle: '#00bcd4' },
  { fill: 'rgba(255, 82, 167, 0.32)', border: '#ff52a7', handle: '#ff52a7' },
  { fill: 'rgba(255, 214, 0, 0.32)', border: '#ffd600', handle: '#ffd600' },
];

const EDITOR_CLIP_MAX = 8;

/**
 * @param {number} index
 */
function editorClipColor(index) {
  const i = ((index % EDITOR_CLIP_COLORS.length) + EDITOR_CLIP_COLORS.length) % EDITOR_CLIP_COLORS.length;
  return EDITOR_CLIP_COLORS[i];
}

/**
 * @returns {string}
 */
function createEditorClipId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {{ start: number; end: number; colorIndex?: number; id?: string }} partial
 * @returns {{ id: string; start: number; end: number; colorIndex: number }}
 */
function createEditorClip(partial) {
  return {
    id: partial.id || createEditorClipId(),
    start: partial.start,
    end: partial.end,
    colorIndex: typeof partial.colorIndex === 'number' ? partial.colorIndex : 0,
  };
}

/**
 * Next free color index among existing clips.
 * @param {{ colorIndex: number }[]} clips
 */
function nextEditorClipColorIndex(clips) {
  const used = new Set(clips.map((c) => c.colorIndex));
  for (let i = 0; i < EDITOR_CLIP_COLORS.length; i += 1) {
    if (!used.has(i)) return i;
  }
  return clips.length % EDITOR_CLIP_COLORS.length;
}

/**
 * Place a new clip around `atTime` with `length`.
 * @param {number} atTime
 * @param {number} length
 * @param {number} duration
 */
function rangeAroundTime(atTime, length, duration) {
  const min = editorMinClipLength(duration);
  const max = editorMaxClipLength(duration);
  const len = clamp(length, min, Math.min(max, duration));
  let start = atTime - len / 2;
  let end = start + len;
  if (start < 0) {
    start = 0;
    end = len;
  }
  if (end > duration) {
    end = duration;
    start = Math.max(0, end - len);
  }
  return { start, end };
}

globalThis.EDITOR_CLIP_COLORS = EDITOR_CLIP_COLORS;
globalThis.EDITOR_CLIP_MAX = EDITOR_CLIP_MAX;
globalThis.editorClipColor = editorClipColor;
globalThis.createEditorClipId = createEditorClipId;
globalThis.createEditorClip = createEditorClip;
globalThis.nextEditorClipColorIndex = nextEditorClipColorIndex;
globalThis.rangeAroundTime = rangeAroundTime;
