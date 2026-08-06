import { describe, expect, it, beforeEach } from 'vitest';
import '../lib/clip-constants.js';
import '../lib/time.js';
import '../lib/log.js';
import '../content/editor/constants.js';
import '../content/editor/filmstrip-cache.js';
import '../content/editor/editor-clips.js';
import '../content/editor/keys.js';
import '../content/editor/overlay-html.js';
import '../content/editor/playback.js';
import '../content/editor/timeline-clips.js';

describe('editor constants', () => {
  it('expose inset 10px et filmstrip count fixe', () => {
    expect(globalThis.CLIPPY_PANEL_INSET).toBe(10);
    expect(globalThis.CLIPPY_FILMSTRIP_COUNT).toBe(10);
  });

  it('filmstripCacheKey = videoId uniquement', () => {
    expect(globalThis.filmstripCacheKey('abc', 90.4, 12)).toBe('abc');
    expect(globalThis.filmstripCacheKey('', 90)).toBe('');
  });
});

describe('editor clips colors', () => {
  it('crée un clip avec couleur', () => {
    const c = globalThis.createEditorClip({ start: 1, end: 10, colorIndex: 2 });
    expect(c.start).toBe(1);
    expect(c.end).toBe(10);
    expect(c.colorIndex).toBe(2);
    expect(c.id).toBeTruthy();
  });

  it('attribue la prochaine couleur libre', () => {
    expect(globalThis.nextEditorClipColorIndex([{ colorIndex: 0 }, { colorIndex: 1 }])).toBe(2);
    expect(globalThis.nextEditorClipColorIndex([])).toBe(0);
  });

  it('rangeAroundTime centre et borne', () => {
    const r = globalThis.rangeAroundTime(50, 20, 100);
    expect(r.end - r.start).toBe(20);
    expect(r.start).toBeGreaterThanOrEqual(0);
    expect(r.end).toBeLessThanOrEqual(100);
  });

  it('editorClipColor cycle', () => {
    const a = globalThis.editorClipColor(0);
    const b = globalThis.editorClipColor(globalThis.EDITOR_CLIP_COLORS.length);
    expect(a.border).toBe(b.border);
  });
});

describe('filmstrip cache LRU', () => {
  beforeEach(() => {
    globalThis.clearFilmstripCache();
  });

  it('stocke et vide le cache', () => {
    const cache = globalThis.getFilmstripCache();
    cache.set('v1', ['a', 'b']);
    expect(cache.size).toBe(1);
    globalThis.clearFilmstripCache();
    expect(cache.size).toBe(0);
  });
});

describe('overlay html', () => {
  it('multi-régions, pas de frame-preview / meta', () => {
    const html = globalThis.createEditorOverlayHtml();
    expect(html).toContain('data-panel');
    expect(html).toContain('data-regions');
    expect(html).toContain('data-timeline');
    expect(html).toContain('data-clip-tooltip');
    expect(html).toContain('data-action="save"');
    expect(html).not.toContain('Double-clic');
    expect(html).not.toContain('data-frame-preview');
    expect(html).not.toContain('data-meta-start');
    expect(html).not.toContain('data-clips-layer');
  });
});

describe('updateClipTooltip', () => {
  it('remplit début / durée / fin', () => {
    const tip = {
      hidden: true,
      offsetWidth: 120,
      offsetHeight: 60,
      style: {},
      querySelector(sel) {
        if (!this._nodes) {
          this._nodes = {
            '[data-tip-start]': { textContent: '' },
            '[data-tip-duration]': { textContent: '' },
            '[data-tip-end]': { textContent: '' },
          };
        }
        return this._nodes[sel] || null;
      },
    };
    globalThis.updateClipTooltip(
      tip,
      { id: 'x', start: 10, end: 25 },
      { x: 100, y: 50, timeline: { left: 0, top: 0, width: 400, height: 44 } },
    );
    expect(tip.hidden).toBe(false);
    expect(tip.querySelector('[data-tip-start]').textContent).toBe('0:10');
    expect(tip.querySelector('[data-tip-duration]').textContent).toBe('0:15');
    expect(tip.querySelector('[data-tip-end]').textContent).toBe('0:25');
  });
});

describe('editor keys', () => {
  function fakeApi(overrides = {}) {
    return {
      isOpen: () => true,
      close: () => {},
      triggerSave: () => {},
      togglePlay: () => {},
      removeActiveClip: () => {},
      ...overrides,
    };
  }

  function fakeKey(key, extras = {}) {
    return {
      key,
      code: key === ' ' ? 'Space' : key,
      altKey: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      repeat: false,
      isComposing: false,
      target: null,
      preventDefault() {},
      stopImmediatePropagation() {},
      ...extras,
    };
  }

  it('Escape ferme', () => {
    let closed = false;
    const { onKeyDown } = globalThis.createEditorKeyHandlers(
      fakeApi({
        close: () => {
          closed = true;
        },
      }),
    );
    onKeyDown(fakeKey('Escape'));
    expect(closed).toBe(true);
  });

  it('Enter save', () => {
    let saved = false;
    const { onKeyDown } = globalThis.createEditorKeyHandlers(
      fakeApi({
        triggerSave: () => {
          saved = true;
        },
      }),
    );
    onKeyDown(fakeKey('Enter'));
    expect(saved).toBe(true);
  });

  it('Delete retire le clip actif', () => {
    let removed = false;
    const { onKeyDown } = globalThis.createEditorKeyHandlers(
      fakeApi({
        removeActiveClip: () => {
          removed = true;
        },
      }),
    );
    onKeyDown(fakeKey('Delete'));
    expect(removed).toBe(true);
  });

  it('Space toggle play', () => {
    let toggled = 0;
    const { onKeyDown } = globalThis.createEditorKeyHandlers(
      fakeApi({
        togglePlay: () => {
          toggled += 1;
        },
      }),
    );
    onKeyDown(fakeKey(' '));
    expect(toggled).toBe(1);
  });
});

describe('playback play catch', () => {
  it('ne throw pas si play rejette', () => {
    const video = {
      paused: true,
      play: () => Promise.reject(new Error('autoplay')),
      pause() {},
    };
    expect(() => globalThis.toggleEditorPlayback(video)).not.toThrow();
  });
});
