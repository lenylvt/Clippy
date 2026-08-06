/**
 * @typedef {{ id: string; start: number; end: number; colorIndex: number }} EditorDraftClip
 */

/**
 * @typedef {{
 *   getDuration: () => number;
 *   getClips: () => EditorDraftClip[];
 *   getActiveId: () => string | null;
 *   setActiveId: (id: string) => void;
 *   getClipStart: () => number;
 *   setClipStart: (v: number) => void;
 *   getClipEnd: () => number;
 *   setClipEnd: (v: number) => void;
 *   setDragMode: (mode: 'left' | 'right' | 'move' | 'playhead' | null) => void;
 *   abortFilmstrip: (opts?: { skipRestore?: boolean }) => void;
 *   ensureFilmstrip: () => void;
 *   isFilmstripBusy?: () => boolean;
 *   seekTo: (t: number) => void;
 *   render: () => void;
 *   addClipAt: (time: number) => void;
 * }} EditorTimelineApi
 */

/**
 * @param {Element | null} timeline
 * @param {EditorTimelineApi} api
 * @returns {(() => void) | undefined} unbind
 */
function bindEditorTimeline(timeline, api) {
  if (!timeline || !(timeline instanceof HTMLElement)) {
    clippyLog('editor', 'timeline:bind_skipped_incomplete_dom');
    return undefined;
  }

  const track = timeline.querySelector('[data-track]');
  const regionsHost = timeline.querySelector('[data-regions]');
  const playhead = timeline.querySelector('[data-playhead]');

  if (
    !(track instanceof HTMLElement) ||
    !(regionsHost instanceof HTMLElement) ||
    !(playhead instanceof HTMLElement)
  ) {
    clippyLog('editor', 'timeline:bind_skipped_incomplete_dom');
    return undefined;
  }

  /** @type {'move' | 'left' | 'right' | 'playhead' | null} */
  let mode = null;
  /** @type {number | null} */
  let pointerId = null;
  let originTime = 0;
  let originStart = 0;
  let originEnd = 0;
  let seekRaf = 0;
  /** @type {number | null} */
  let pendingSeek = null;
  /** Ignore the click that follows a dblclick add. */
  let suppressPlayheadUntil = 0;

  const minLen = () => editorMinClipLength(api.getDuration());
  const maxLen = () => editorMaxClipLength(api.getDuration());

  const timeAt = (clientX) => {
    const rect = track.getBoundingClientRect();
    if (!(rect.width > 0)) return 0;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return ratio * api.getDuration();
  };

  const flushSeek = () => {
    seekRaf = 0;
    if (pendingSeek === null) return;
    const t = pendingSeek;
    pendingSeek = null;
    api.seekTo(t);
  };

  const scheduleSeek = (t) => {
    pendingSeek = t;
    if (!seekRaf) seekRaf = requestAnimationFrame(flushSeek);
  };

  const endDrag = () => {
    if (mode === null) return;
    const wasDragging = mode !== null;
    mode = null;
    pointerId = null;
    api.setDragMode(null);
    if (seekRaf) {
      cancelAnimationFrame(seekRaf);
      seekRaf = 0;
    }
    if (pendingSeek !== null) {
      api.seekTo(pendingSeek);
      pendingSeek = null;
    }
    if (wasDragging) api.ensureFilmstrip();
  };

  /**
   * @param {PointerEvent} e
   * @param {'move' | 'left' | 'right' | 'playhead'} nextMode
   */
  const beginDrag = (e, nextMode) => {
    if (api.isFilmstripBusy?.()) {
      api.abortFilmstrip({ skipRestore: true });
    }
    mode = nextMode;
    api.setDragMode(nextMode);
    pointerId = e.pointerId;
    originTime = timeAt(e.clientX);
    originStart = api.getClipStart();
    originEnd = api.getClipEnd();
    try {
      track.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    e.preventDefault();
    e.stopPropagation();

    if (nextMode === 'left') scheduleSeek(api.getClipStart());
    if (nextMode === 'right') scheduleSeek(api.getClipEnd());
  };

  const onTrackPointerDown = (e) => {
    if (!(e instanceof PointerEvent) || e.button !== 0) return;
    if (Date.now() < suppressPlayheadUntil) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    if (target === playhead || playhead.contains(target)) {
      beginDrag(e, 'playhead');
      return;
    }

    const handle = target.closest('[data-handle]');
    const region = target.closest('[data-region][data-clip-id]');
    if (region instanceof HTMLElement && regionsHost.contains(region)) {
      const clipId = region.dataset.clipId;
      if (clipId) api.setActiveId(clipId);

      const which = handle instanceof HTMLElement ? handle.dataset.handle : null;
      if (which === 'left' || which === 'right') {
        beginDrag(e, which);
      } else {
        beginDrag(e, 'move');
      }
      api.render();
      return;
    }

    beginDrag(e, 'playhead');
    scheduleSeek(timeAt(e.clientX));
    api.render();
  };

  const onPointerMove = (e) => {
    if (mode === null || e.pointerId !== pointerId) return;

    if (mode === 'playhead') {
      scheduleSeek(timeAt(e.clientX));
      api.render();
      return;
    }

    const delta = timeAt(e.clientX) - originTime;
    const duration = api.getDuration();
    const min = minLen();
    const max = maxLen();

    if (mode === 'move') {
      let length = originEnd - originStart;
      length = clamp(length, min, max);
      let start = originStart + delta;
      let end = start + length;
      if (start < 0) {
        start = 0;
        end = length;
      }
      if (end > duration) {
        end = duration;
        start = Math.max(0, end - length);
      }
      api.setClipStart(start);
      api.setClipEnd(start + (end - start));
    } else if (mode === 'left') {
      const end = originEnd;
      const maxStart = Math.max(0, end - min);
      const minStart = Math.max(0, end - max);
      const start = clamp(originStart + delta, minStart, maxStart);
      api.setClipStart(start);
      api.setClipEnd(end);
      scheduleSeek(start);
    } else if (mode === 'right') {
      const start = originStart;
      const minEnd = Math.min(duration, start + min);
      const maxEnd = Math.min(duration, start + max);
      const end = clamp(originEnd + delta, minEnd, maxEnd);
      api.setClipStart(start);
      api.setClipEnd(end);
      scheduleSeek(end);
    }

    api.render();
  };

  const onPointerUp = (e) => {
    if (e.pointerId !== pointerId) return;
    endDrag();
  };

  const onLostCapture = () => {
    endDrag();
  };

  const onDblClick = (e) => {
    if (!(e instanceof MouseEvent)) return;
    if (e.target instanceof Element && e.target.closest('button, a, [data-action]')) return;
    e.preventDefault();
    e.stopPropagation();
    suppressPlayheadUntil = Date.now() + 400;
    endDrag();
    api.addClipAt(timeAt(e.clientX));
  };

  /** Hover tooltip on regions */
  const onPointerOver = (e) => {
    const region = e.target instanceof Element ? e.target.closest('[data-region][data-clip-id]') : null;
    if (!(region instanceof HTMLElement) || !regionsHost.contains(region)) return;
    const tip = timeline.querySelector('[data-clip-tooltip]');
    if (!(tip instanceof HTMLElement)) return;
    const start = Number(region.dataset.start);
    const end = Number(region.dataset.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    updateClipTooltip(
      tip,
      { id: region.dataset.clipId || '', start, end },
      { x: e.clientX, y: e.clientY, timeline: timeline.getBoundingClientRect() },
    );
  };

  const onPointerMoveTip = (e) => {
    const tip = timeline.querySelector('[data-clip-tooltip]');
    if (!(tip instanceof HTMLElement) || tip.hidden) return;
    const region = e.target instanceof Element ? e.target.closest('[data-region][data-clip-id]') : null;
    if (!(region instanceof HTMLElement)) return;
    const start = Number(region.dataset.start);
    const end = Number(region.dataset.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    updateClipTooltip(
      tip,
      { id: region.dataset.clipId || '', start, end },
      { x: e.clientX, y: e.clientY, timeline: timeline.getBoundingClientRect() },
    );
  };

  const onPointerLeave = () => {
    const tip = timeline.querySelector('[data-clip-tooltip]');
    if (tip instanceof HTMLElement) updateClipTooltip(tip, null);
  };

  track.addEventListener('pointerdown', onTrackPointerDown);
  timeline.addEventListener('pointermove', onPointerMove);
  timeline.addEventListener('pointerup', onPointerUp);
  timeline.addEventListener('pointercancel', onPointerUp);
  timeline.addEventListener('lostpointercapture', onLostCapture);
  timeline.addEventListener('dblclick', onDblClick);
  regionsHost.addEventListener('pointerover', onPointerOver);
  regionsHost.addEventListener('pointermove', onPointerMoveTip);
  regionsHost.addEventListener('pointerleave', onPointerLeave);

  return () => {
    if (seekRaf) cancelAnimationFrame(seekRaf);
    track.removeEventListener('pointerdown', onTrackPointerDown);
    timeline.removeEventListener('pointermove', onPointerMove);
    timeline.removeEventListener('pointerup', onPointerUp);
    timeline.removeEventListener('pointercancel', onPointerUp);
    timeline.removeEventListener('lostpointercapture', onLostCapture);
    timeline.removeEventListener('dblclick', onDblClick);
    regionsHost.removeEventListener('pointerover', onPointerOver);
    regionsHost.removeEventListener('pointermove', onPointerMoveTip);
    regionsHost.removeEventListener('pointerleave', onPointerLeave);
  };
}

globalThis.bindEditorTimeline = bindEditorTimeline;
