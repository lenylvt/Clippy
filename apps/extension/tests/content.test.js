import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import '../lib/log.js';
import '../lib/clip-constants.js';
import '../lib/youtube.js';
import '../lib/title.js';
import '../lib/stages.js';
import '../content/clip-client.js';

// Minimal DOM stubs for content helpers (no jsdom)
function installDomStub() {
  const listeners = new Map();
  /** @type {ReturnType<typeof createLiveBadge> | null} */
  let liveBadge = null;

  function createLiveBadge(opts = {}) {
    const attrs = {};
    if (opts.disabled) attrs.disabled = '';
    return {
      attrs,
      hasAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attrs, name);
      },
      getClientRects() {
        return opts.hidden ? [] : [{ width: 40, height: 12 }];
      },
      style: {
        display: opts.hidden ? 'none' : 'inline',
        visibility: opts.hidden ? 'hidden' : 'visible',
        opacity: opts.hidden ? '0' : '1',
      },
    };
  }

  class FakeEl {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.attrs = {};
      this.isConnected = true;
      this.parentElement = null;
      this.className = '';
      this.style = {};
    }
    setAttribute(k, v) {
      this.attrs[k] = String(v);
    }
    getAttribute(k) {
      return this.attrs[k] ?? null;
    }
    querySelector() {
      return null;
    }
    addEventListener() {}
    removeEventListener() {}
    remove() {
      this.isConnected = false;
    }
  }

  class FakeVideo extends FakeEl {
    constructor() {
      super('video');
      this.duration = 120;
      this.readyState = 2;
      this.videoWidth = 640;
      this.videoHeight = 360;
      this.currentTime = 30;
    }
  }

  let video = null;
  const moviePlayer = new FakeEl('div');
  moviePlayer.id = 'movie_player';

  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };

  const doc = {
    title: 'Demo - YouTube',
    documentElement: new FakeEl('html'),
    body: new FakeEl('body'),
    querySelector(sel) {
      if (sel === '#movie_player video.html5-main-video') return video;
      if (sel === '#movie_player') return moviePlayer;
      if (sel === '.ytp-live-badge') return liveBadge;
      return null;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    createElement(tag) {
      return tag === 'video' ? new FakeVideo() : new FakeEl(tag);
    },
    dispatch(type) {
      for (const fn of listeners.get(type) || []) fn();
    },
  };

  globalThis.document = doc;
  globalThis.window = globalThis;
  window.getComputedStyle = (el) => el?.style ?? { display: 'none', visibility: 'hidden', opacity: '0' };
  window.setTimeout = globalThis.setTimeout.bind(globalThis);
  window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
  window.setInterval = globalThis.setInterval.bind(globalThis);
  window.clearInterval = globalThis.clearInterval.bind(globalThis);
  window.addEventListener = doc.addEventListener.bind(doc);
  window.removeEventListener = doc.removeEventListener.bind(doc);
  // @ts-expect-error stub
  window.location = { href: 'https://www.youtube.com/watch?v=DkCkIk3MkB8' };

  return {
    setVideo(v) {
      video = v;
    },
    setLiveBadge(opts) {
      liveBadge = opts === null ? null : createLiveBadge(opts || {});
    },
    FakeVideo,
    doc,
  };
}

describe('content helpers', () => {
  let dom;

  beforeEach(() => {
    dom = installDomStub();
    // Re-import content after DOM stubs — functions attach to globalThis
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('labelForClipError mappe les codes métier', async () => {
    await import('../content/content.js');
    expect(labelForClipError('pairing_required')).toBe('Relie l’app (réglages → QR)');
    expect(labelForClipError('clip_too_short')).toBe('Clip trop court');
    expect(labelForClipError('Relie l’app (réglages → QR)')).toBe('Relie l’app (réglages → QR)');
    expect(labelForClipError('weird_code')).toBe('Échec');
  });

  it('queueStatusFromStage est idempotent', async () => {
    await import('../content/content.js');
    expect(queueStatusFromStage('downloading')).toBe('download');
    expect(queueStatusFromStage('download')).toBe('download');
    expect(queueStatusFromStage('cropping')).toBe('crop');
    expect(queueStatusFromStage('nope')).toBeUndefined();
  });

  it('openEditorFailureLabel mappe context invalidated', async () => {
    await import('../content/content.js');
    expect(openEditorFailureLabel(new Error('Extension context invalidated'))).toBe(
      'Recharge la page',
    );
    expect(openEditorFailureLabel(new Error('boom'))).toBe('Impossible d’ouvrir Clippy');
  });

  it('resolveClipDuration ignore null / string', async () => {
    await import('../content/content.js');
    expect(resolveClipDuration(null)).toBe(globalThis.DEFAULT_CLIP_DURATION);
    expect(resolveClipDuration('')).toBe(globalThis.DEFAULT_CLIP_DURATION);
    expect(resolveClipDuration(45)).toBe(45);
  });

  it('isLiveVideo : Infinity = live ; durée finie = VOD même avec badge DOM', async () => {
    await import('../content/content.js');
    const v = new dom.FakeVideo();
    v.duration = Infinity;
    expect(isLiveVideo(v)).toBe(true);

    v.duration = 120;
    dom.setLiveBadge({}); // badge présent mais VOD
    expect(isLiveVideo(v)).toBe(false);

    v.duration = NaN;
    dom.setLiveBadge({ hidden: true });
    expect(isLiveVideo(v)).toBe(false);

    dom.setLiveBadge({});
    expect(isLiveVideo(v)).toBe(true);

    dom.setLiveBadge({ disabled: true });
    expect(isLiveVideo(v)).toBe(false);
  });

  it('isLiveVideo détecte duration Infinity', async () => {
    await import('../content/content.js');
    const v = new dom.FakeVideo();
    v.duration = Infinity;
    expect(isLiveVideo(v)).toBe(true);
    expect(isVideoReady(v)).toBe(false);
  });

  it('waitForVideo attend l’apparition DOM', async () => {
    await import('../content/content.js');
    dom.setVideo(null);

    const pending = waitForVideo({ timeoutMs: 2000 });
    await new Promise((r) => setTimeout(r, 20));
    const v = new dom.FakeVideo();
    dom.setVideo(v);
    // trigger check via navigate
    dom.doc.dispatch('yt-navigate-finish');

    const result = await pending;
    expect(result).toBe(v);
  });

  it('waitForVideo timeout → null', async () => {
    await import('../content/content.js');
    dom.setVideo(null);
    const result = await waitForVideo({ timeoutMs: 50 });
    expect(result).toBeNull();
  });

  it('getVideo ne prend que la vidéo principale', async () => {
    await import('../content/content.js');
    const v = new dom.FakeVideo();
    dom.setVideo(v);
    expect(getVideo()).toBe(v);
    dom.setVideo(null);
    expect(getVideo()).toBeNull();
  });
});
