/**
 * Guard against missing classic-script deps (cf. cleanYoutubeTitle / stageToQueueStatus).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = require(join(root, 'manifest.json'));

/** Cross-file APIs that content scripts must expose via globalThis (or top-level). */
const REQUIRED_CONTENT_APIS = [
  'clippyLog',
  'MIN_CLIP_SECONDS',
  'MAX_CLIP_SECONDS',
  'DEFAULT_CLIP_DURATION',
  'formatDuration',
  'normalizeClip',
  'editorMinClipLength',
  'editorMaxClipLength',
  'getYoutubeVideoId',
  'youtubeThumbUrl',
  'cleanYoutubeTitle',
  'stageToQueueStatus',
  'labelForStage',
  'showStatusBadge',
  'clearFilmstripCache',
  'createEditorOverlayHtml',
  'createEditorClip',
  'ClipEditor',
  'injectPlayerButton',
  'canonicalYoutubeWatchUrl',
  'startClipJob',
  'clippyQueue',
];

const REQUIRED_CONTENT_FILES = [
  'lib/log.js',
  'lib/clip-constants.js',
  'lib/time.js',
  'lib/youtube.js',
  'lib/title.js',
  'lib/stages.js',
  'lib/status-badge.js',
];

const REQUIRED_OPTIONS_FILES = [
  'lib/config.js',
  'lib/clip-constants.js',
  'lib/time.js',
  'lib/qrcode.js',
  'options/pairing-helpers.js',
  'options/options.js',
];

describe('extension script graph', () => {
  it('content_scripts inclut les libs partagées critiques', () => {
    const files = manifest.content_scripts[0].js;
    for (const f of REQUIRED_CONTENT_FILES) {
      expect(files, `missing ${f}`).toContain(f);
    }
    // stages before clip-queue (queueBarWidth local) — order soft check
    expect(files.indexOf('lib/stages.js')).toBeLessThan(files.indexOf('content/queue/clip-queue.js'));
    expect(files.indexOf('lib/title.js')).toBeLessThan(files.indexOf('content/content.js'));
  });

  it('options.html charge config + constants + helpers', () => {
    const html = readFileSync(join(root, 'options/options.html'), 'utf8');
    for (const f of REQUIRED_OPTIONS_FILES) {
      const leaf = f.split('/').pop();
      expect(html).toContain(leaf);
    }
  });

  it('charge la chaîne content_scripts dans un sandbox sans ReferenceError API', () => {
    const files = manifest.content_scripts[0].js;
    const sandbox = {
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      requestAnimationFrame: (cb) => setTimeout(cb, 0),
      cancelAnimationFrame: clearTimeout,
      chrome: {
        runtime: { onMessage: { addListener() {} }, lastError: null, sendMessage: async () => ({}) },
        storage: { sync: { get: async () => ({}) } },
      },
      document: {
        title: 'Demo - YouTube',
        documentElement: { appendChild() {} },
        body: { appendChild() {} },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        removeEventListener() {},
        createElement: () => ({
          style: {},
          classList: { add() {}, remove() {}, toggle() {} },
          setAttribute() {},
          getAttribute: () => null,
          appendChild() {},
          addEventListener() {},
          removeEventListener() {},
          remove() {},
        }),
      },
      window: null,
      location: { href: 'https://www.youtube.com/watch?v=DkCkIk3MkB8' },
      addEventListener() {},
      removeEventListener() {},
      HTMLElement: class {},
      HTMLVideoElement: class {},
      HTMLButtonElement: class {},
      HTMLAnchorElement: class {},
      HTMLInputElement: class {},
      HTMLTextAreaElement: class {},
      HTMLSelectElement: class {},
      HTMLCanvasElement: class {},
      MutationObserver: class {
        observe() {}
        disconnect() {}
      },
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      getComputedStyle: () => ({ display: 'none', visibility: 'hidden', opacity: '0' }),
      URL,
      Map,
      Set,
      WeakMap,
      Promise,
      Error,
      Math,
      Number,
      String,
      Boolean,
      Array,
      Object,
      JSON,
      Infinity,
      NaN,
      undefined,
      parseInt,
      isNaN,
      encodeURIComponent,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.self = sandbox;
    // Mirror common window aliases used by content scripts
    sandbox.window.addEventListener = sandbox.addEventListener;
    sandbox.window.removeEventListener = sandbox.removeEventListener;
    sandbox.window.setTimeout = setTimeout;
    sandbox.window.clearTimeout = clearTimeout;
    sandbox.window.setInterval = setInterval;
    sandbox.window.clearInterval = clearInterval;
    sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;
    sandbox.window.cancelAnimationFrame = sandbox.cancelAnimationFrame;
    sandbox.window.matchMedia = sandbox.matchMedia;
    sandbox.window.getComputedStyle = sandbox.getComputedStyle;
    sandbox.window.location = sandbox.location;

    const context = vm.createContext(sandbox);
    for (const rel of files) {
      const code = readFileSync(join(root, rel), 'utf8');
      try {
        vm.runInContext(code, context, { filename: rel });
      } catch (err) {
        throw new Error(`Failed loading ${rel}: ${err instanceof Error ? err.message : err}`);
      }
    }

    for (const api of REQUIRED_CONTENT_APIS) {
      expect(sandbox[api], `API manquante après load: ${api}`).toBeTruthy();
    }

    // Smoke: stage mapping + title cleaning must work
    expect(sandbox.stageToQueueStatus('downloading')).toBe('download');
    expect(sandbox.cleanYoutubeTitle('Foo - YouTube')).toBe('Foo');
    expect(sandbox.DEFAULT_CLIP_DURATION).toBe(90);
  });
});
