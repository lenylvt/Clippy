import { describe, expect, it, beforeEach } from 'vitest';
import '../lib/clip-constants.js';
import '../lib/time.js';
import '../lib/log.js';
import '../content/editor/constants.js';
import '../content/editor/filmstrip-cache.js';
import '../content/editor/keys.js';
import '../content/editor/overlay-html.js';

describe('editor constants', () => {
  it('expose inset et filmstrip count', () => {
    expect(globalThis.CLIPPY_PANEL_INSET).toBe(10);
    expect(globalThis.CLIPPY_FILMSTRIP_COUNT).toBe(16);
  });
});

describe('filmstrip cache', () => {
  beforeEach(() => {
    globalThis.clearFilmstripCache();
  });

  it('stocke et vide le cache', () => {
    const cache = globalThis.getFilmstripCache();
    cache.set('v:10:16', ['a', 'b']);
    expect(cache.size).toBe(1);
    globalThis.clearFilmstripCache();
    expect(cache.size).toBe(0);
  });
});

describe('overlay html', () => {
  it('contient panel, timeline et actions', () => {
    const html = globalThis.createEditorOverlayHtml();
    expect(html).toContain('data-panel');
    expect(html).toContain('data-timeline');
    expect(html).toContain('data-action="save"');
    expect(html).toContain('data-action="close"');
  });
});

describe('editor keys', () => {
  function fakeKey(key, extras = {}) {
    return {
      key,
      code: key === ' ' ? 'Space' : key,
      altKey: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      isComposing: false,
      preventDefault() {},
      stopImmediatePropagation() {},
      ...extras,
    };
  }

  it('Escape ferme', () => {
    let closed = false;
    const { onKeyDown } = globalThis.createEditorKeyHandlers({
      isOpen: () => true,
      close: () => {
        closed = true;
      },
      triggerSave: () => {},
      togglePlay: () => {},
      getClipStart: () => 0,
      setClipStart: () => {},
      getClipEnd: () => 10,
      setClipEnd: () => {},
      getDuration: () => 100,
      getVideo: () => null,
      seekTo: () => {},
      render: () => {},
      showFramePreviewAt: () => {},
    });

    let prevented = false;
    const e = fakeKey('Escape', {
      preventDefault() {
        prevented = true;
      },
    });
    onKeyDown(e);
    expect(closed).toBe(true);
    expect(prevented).toBe(true);
  });

  it('Enter déclenche le save', () => {
    let saved = false;
    const { onKeyDown } = globalThis.createEditorKeyHandlers({
      isOpen: () => true,
      close: () => {},
      triggerSave: () => {
        saved = true;
      },
      togglePlay: () => {},
      getClipStart: () => 0,
      setClipStart: () => {},
      getClipEnd: () => 10,
      setClipEnd: () => {},
      getDuration: () => 100,
      getVideo: () => null,
      seekTo: () => {},
      render: () => {},
      showFramePreviewAt: () => {},
    });

    onKeyDown(fakeKey('Enter'));
    expect(saved).toBe(true);
  });
});
