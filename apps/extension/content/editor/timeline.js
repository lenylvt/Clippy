/**
 * @typedef {{
 *   getDuration: () => number;
 *   getClipStart: () => number;
 *   getClipEnd: () => number;
 *   setClipStart: (v: number) => void;
 *   setClipEnd: (v: number) => void;
 *   setDragMode: (mode: 'left' | 'right' | 'move' | 'playhead' | null) => void;
 *   abortFilmstrip: () => void;
 *   seekTo: (t: number) => void;
 *   render: () => void;
 *   showFramePreviewAt: (time: number, handle: 'left' | 'right' | null) => void;
 *   hideFramePreview: () => void;
 * }} EditorTimelineApi
 */

/**
 * @param {Element | null} timeline
 * @param {EditorTimelineApi} api
 */
function bindEditorTimeline(timeline, api) {
  if (!timeline || !(timeline instanceof HTMLElement)) return;

  const track = timeline.querySelector('[data-track]');
  const region = timeline.querySelector('[data-region]');
  const playhead = timeline.querySelector('[data-playhead]');
  const leftHandle = timeline.querySelector('[data-handle="left"]');
  const rightHandle = timeline.querySelector('[data-handle="right"]');

  if (
    !(track instanceof HTMLElement) ||
    !(region instanceof HTMLElement) ||
    !(playhead instanceof HTMLElement) ||
    !(leftHandle instanceof HTMLElement) ||
    !(rightHandle instanceof HTMLElement)
  ) {
    return;
  }

  /** @type {'move' | 'left' | 'right' | 'playhead' | null} */
  let mode = null;
  let pointerId = null;
  let originX = 0;
  let originStart = 0;
  let originEnd = 0;

  const timeAt = (clientX) => {
    const rect = track.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return ratio * api.getDuration();
  };

  const onPointerDown = (e, nextMode) => {
    if (!(e instanceof PointerEvent)) return;
    api.abortFilmstrip();
    mode = nextMode;
    api.setDragMode(nextMode);
    pointerId = e.pointerId;
    originX = e.clientX;
    originStart = api.getClipStart();
    originEnd = api.getClipEnd();
    e.currentTarget?.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();

    if (nextMode === 'left') api.seekTo(api.getClipStart());
    if (nextMode === 'right') api.seekTo(api.getClipEnd());
    api.showFramePreviewAt(
      nextMode === 'right' ? api.getClipEnd() : nextMode === 'left' ? api.getClipStart() : timeAt(e.clientX),
      nextMode === 'left' || nextMode === 'right' ? nextMode : null,
    );
  };

  track.addEventListener('pointerdown', (e) => {
    if (e.target === leftHandle || e.target === rightHandle) return;
    if (
      region.contains(/** @type {Node} */ (e.target)) &&
      e.target !== playhead &&
      !playhead.contains(/** @type {Node} */ (e.target))
    ) {
      return;
    }
    onPointerDown(e, 'playhead');
    api.seekTo(timeAt(e.clientX));
    api.render();
  });

  region.addEventListener('pointerdown', (e) => {
    if (
      e.target === leftHandle ||
      e.target === rightHandle ||
      e.target === playhead ||
      playhead.contains(/** @type {Node} */ (e.target))
    ) {
      return;
    }
    onPointerDown(e, 'move');
  });

  playhead.addEventListener('pointerdown', (e) => onPointerDown(e, 'playhead'));
  leftHandle.addEventListener('pointerdown', (e) => onPointerDown(e, 'left'));
  rightHandle.addEventListener('pointerdown', (e) => onPointerDown(e, 'right'));

  const onPointerMove = (e) => {
    if (mode === null || e.pointerId !== pointerId) return;

    if (mode === 'playhead') {
      const t = timeAt(e.clientX);
      api.seekTo(t);
      api.showFramePreviewAt(t, null);
      api.render();
      return;
    }

    const delta = timeAt(e.clientX) - timeAt(originX);

    if (mode === 'move') {
      const length = originEnd - originStart;
      let start = originStart + delta;
      let end = originEnd + delta;
      if (start < 0) {
        start = 0;
        end = length;
      }
      if (end > api.getDuration()) {
        end = api.getDuration();
        start = end - length;
      }
      api.setClipStart(start);
      api.setClipEnd(end);
      api.hideFramePreview();
    } else if (mode === 'left') {
      const end = originEnd;
      const start = clamp(originStart + delta, 0, end - globalThis.MIN_CLIP_SECONDS);
      api.setClipStart(start);
      api.setClipEnd(end);
      api.seekTo(start);
      api.showFramePreviewAt(start, 'left');
    } else if (mode === 'right') {
      const start = originStart;
      const end = clamp(originEnd + delta, start + globalThis.MIN_CLIP_SECONDS, api.getDuration());
      api.setClipStart(start);
      api.setClipEnd(end);
      api.seekTo(end);
      api.showFramePreviewAt(end, 'right');
    }

    api.render();
  };

  const onPointerUp = (e) => {
    if (e.pointerId !== pointerId) return;
    mode = null;
    pointerId = null;
    api.setDragMode(null);
    api.hideFramePreview();
  };

  timeline.addEventListener('pointermove', onPointerMove);
  timeline.addEventListener('pointerup', onPointerUp);
  timeline.addEventListener('pointercancel', onPointerUp);
}

globalThis.bindEditorTimeline = bindEditorTimeline;
