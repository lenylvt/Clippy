import { describe, expect, it, beforeEach, vi } from 'vitest';
import '../lib/clip-constants.js';
import '../lib/log.js';
import '../lib/youtube.js';
import '../lib/title.js';

beforeEach(() => {
  globalThis.document = { title: '(1) Me at the zoo - YouTube' };
  globalThis.window = globalThis;
  // @ts-expect-error test stub
  window.location = {
    href: 'https://www.youtube.com/watch?v=DkCkIk3MkB8&list=PLxx&t=12',
  };
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage: vi.fn(async () => ({ ok: true, id: 'c1', url: 'https://x/c.mp4' })),
    },
  };
});

await import('../content/clip-client.js');

describe('canonicalYoutubeWatchUrl', () => {
  it('construit une URL watch sans params', () => {
    expect(canonicalYoutubeWatchUrl('DkCkIk3MkB8')).toBe(
      'https://www.youtube.com/watch?v=DkCkIk3MkB8',
    );
  });
});

describe('assertValidClipRange', () => {
  it('accepte une plage valide inclusive aux bornes', () => {
    expect(() =>
      assertValidClipRange({ start: 0, end: globalThis.MIN_CLIP_SECONDS }),
    ).not.toThrow();
    expect(() =>
      assertValidClipRange({ start: 0, end: globalThis.MAX_CLIP_SECONDS }),
    ).not.toThrow();
  });

  it('rejette NaN, ordre inversé, trop court / trop long', () => {
    expect(() => assertValidClipRange({ start: NaN, end: 10 })).toThrow('invalid_clip_range');
    expect(() => assertValidClipRange({ start: 10, end: 5 })).toThrow('invalid_clip_range');
    expect(() => assertValidClipRange({ start: 0, end: 1 })).toThrow('clip_too_short');
    expect(() =>
      assertValidClipRange({ start: 0, end: globalThis.MAX_CLIP_SECONDS + 1 }),
    ).toThrow('clip_too_long');
  });
});

describe('startClipJob', () => {
  it('envoie une URL canonique et un titre nettoyé', async () => {
    await startClipJob({ start: 1, end: 10 }, { jobId: 'job_1' });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CREATE_CLIP',
        jobId: 'job_1',
        videoId: 'DkCkIk3MkB8',
        youtubeUrl: 'https://www.youtube.com/watch?v=DkCkIk3MkB8',
        videoTitle: 'Me at the zoo',
        start: 1,
        end: 10,
      }),
    );
  });

  it('utilise videoId / url figés si fournis', async () => {
    await startClipJob(
      { start: 2, end: 12 },
      {
        jobId: 'j2',
        videoId: 'AAAAAAAAAAA',
        youtubeUrl: 'https://www.youtube.com/watch?v=AAAAAAAAAAA',
        videoTitle: 'Frozen',
      },
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        videoId: 'AAAAAAAAAAA',
        youtubeUrl: 'https://www.youtube.com/watch?v=AAAAAAAAAAA',
        videoTitle: 'Frozen',
      }),
    );
  });

  it('échoue si le SW ne répond pas', async () => {
    chrome.runtime.sendMessage = vi.fn(async () => undefined);
    await expect(startClipJob({ start: 1, end: 10 })).rejects.toThrow('sw_no_response');
  });

  it('propage l’erreur métier du SW', async () => {
    chrome.runtime.sendMessage = vi.fn(async () => ({
      ok: false,
      error: 'pairing_required',
    }));
    await expect(startClipJob({ start: 1, end: 10 })).rejects.toThrow('pairing_required');
  });
});

describe('captureVideoThumb', () => {
  it('préfère le fallback YouTube au canvas', () => {
    const url = 'https://i.ytimg.com/vi/DkCkIk3MkB8/mqdefault.jpg';
    expect(captureVideoThumb(null, url)).toBe(url);
  });

  it('retourne undefined sans vidéo ni fallback', () => {
    expect(captureVideoThumb(null)).toBeUndefined();
  });
});
