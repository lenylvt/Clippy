import { describe, expect, it } from 'vitest';
import '../lib/clip-constants.js';
import '../lib/time.js';
import '../content/queue/clip-queue.js';

describe('queue URL allowlists', () => {
  it('accepte thumbs https et data:image jpeg', () => {
    expect(globalThis.isSafeThumbUrl('https://i.ytimg.com/vi/x/mqdefault.jpg')).toBe(true);
    expect(globalThis.isSafeThumbUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
  });

  it('rejette javascript et svg data', () => {
    expect(globalThis.isSafeThumbUrl('javascript:alert(1)')).toBe(false);
    expect(globalThis.isSafeThumbUrl('data:image/svg+xml;base64,PHN2Zy')).toBe(false);
  });

  it('accepte liens https seulement (localhost http ok)', () => {
    expect(globalThis.isSafeLinkUrl('https://example.com/clip')).toBe(true);
    expect(globalThis.isSafeLinkUrl('http://localhost:8787/x')).toBe(true);
    expect(globalThis.isSafeLinkUrl('javascript:alert(1)')).toBe(false);
    expect(globalThis.isSafeLinkUrl('http://evil.com')).toBe(false);
  });
});

describe('queue status + progress', () => {
  it('whitelist les statuts connus', () => {
    expect(globalThis.isQueueStatus('download')).toBe(true);
    expect(globalThis.isQueueStatus('preparing')).toBe(true);
    expect(globalThis.isQueueStatus('"><img src=x onerror=1>')).toBe(false);
  });

  it('clamp progress ignore NaN', () => {
    expect(globalThis.clampProgress(Number.NaN)).toBe(0);
    expect(globalThis.clampProgress(1.5)).toBe(1);
    expect(globalThis.clampProgress(-1)).toBe(0);
  });

  it('queueBarWidth gère NaN comme stub busy', () => {
    expect(globalThis.queueBarWidth('download', Number.NaN)).toBe(8);
    expect(globalThis.queueBarWidth('queued', 0)).toBe(4);
    expect(globalThis.queueBarWidth('done', 0.2)).toBe(100);
  });
});
