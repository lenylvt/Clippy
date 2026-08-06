/**
 * @typedef {{
 *   isOpen: () => boolean;
 *   close: () => void;
 *   triggerSave: () => void;
 *   togglePlay: () => void;
 *   getClipStart: () => number;
 *   setClipStart: (v: number) => void;
 *   getClipEnd: () => number;
 *   setClipEnd: (v: number) => void;
 *   getDuration: () => number;
 *   getVideo: () => HTMLVideoElement | null;
 *   seekTo: (t: number) => void;
 *   render: () => void;
 *   showFramePreviewAt: (time: number, handle: 'left' | 'right' | null) => void;
 * }} EditorKeysApi
 */

/**
 * @param {EditorKeysApi} api
 * @returns {{ onKeyDown: (e: KeyboardEvent) => void; onKeyUp: (e: KeyboardEvent) => void }}
 */
function createEditorKeyHandlers(api) {
  const onKeyDown = (e) => {
    if (!api.isOpen()) return;
    if (e.isComposing) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      api.close();
      return;
    }

    if (e.key === 'Enter' && !e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      api.triggerSave();
      return;
    }

    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      e.stopImmediatePropagation();
      api.togglePlay();
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const step = e.shiftKey ? 1 : 0.2;
      const delta = e.key === 'ArrowLeft' ? -step : step;
      if (e.altKey) {
        api.setClipStart(clamp(api.getClipStart() + delta, 0, api.getClipEnd() - globalThis.MIN_CLIP_SECONDS));
        api.seekTo(api.getClipStart());
      } else if (e.metaKey || e.ctrlKey) {
        api.setClipEnd(clamp(api.getClipEnd() + delta, api.getClipStart() + globalThis.MIN_CLIP_SECONDS, api.getDuration()));
        api.seekTo(api.getClipEnd());
      } else {
        api.seekTo((api.getVideo()?.currentTime ?? 0) + delta);
      }
      api.render();
      api.showFramePreviewAt(api.getVideo()?.currentTime ?? 0, null);
    }
  };

  const onKeyUp = (e) => {
    if (!api.isOpen()) return;
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };

  return { onKeyDown, onKeyUp };
}

/**
 * @param {EditorKeysApi} api
 * @returns {() => void} unbind
 */
function bindEditorKeys(api) {
  const { onKeyDown, onKeyUp } = createEditorKeyHandlers(api);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);
  return () => {
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keyup', onKeyUp, true);
  };
}

globalThis.createEditorKeyHandlers = createEditorKeyHandlers;
globalThis.bindEditorKeys = bindEditorKeys;
