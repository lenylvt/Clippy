import { describe, expect, it } from 'vitest';
import './transcode.js';
import './share-platform.js';

describe('needsMp4Conversion', () => {
  it('retourne false pour mp4', () => {
    expect(needsMp4Conversion(new Blob([], { type: 'video/mp4' }))).toBe(false);
  });

  it('retourne false pour webm sur desktop', () => {
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        userAgent: 'Mozilla/5.0 (Macintosh)',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      },
    });

    expect(needsMp4Conversion(new Blob([], { type: 'video/webm' }))).toBe(false);

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: original,
    });
  });

  it('retourne true pour webm sur iPhone', () => {
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        userAgent: 'Mozilla/5.0 (iPhone)',
        platform: 'iPhone',
        maxTouchPoints: 5,
      },
    });

    expect(needsMp4Conversion(new Blob([], { type: 'video/webm' }))).toBe(true);

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: original,
    });
  });
});
