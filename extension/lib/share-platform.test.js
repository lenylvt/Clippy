import { describe, expect, it } from 'vitest';
import './share-platform.js';

const { isIOSUserAgent, shouldUsePlaybackConvert } = globalThis;

describe('isIOSUserAgent', () => {
  it('détecte iPhone', () => {
    expect(isIOSUserAgent('Mozilla/5.0 (iPhone)', 'iPhone', 5)).toBe(true);
  });

  it('détecte iPad récent', () => {
    expect(isIOSUserAgent('Mozilla/5.0 (Macintosh)', 'MacIntel', 5)).toBe(true);
  });

  it('ignore desktop mac', () => {
    expect(isIOSUserAgent('Mozilla/5.0 (Macintosh)', 'MacIntel', 0)).toBe(false);
  });
});

describe('shouldUsePlaybackConvert', () => {
  it('active sur iOS et Android', () => {
    expect(shouldUsePlaybackConvert('Mozilla/5.0 (iPhone)', 'iPhone', 5)).toBe(true);
    expect(shouldUsePlaybackConvert('Mozilla/5.0 (Linux; Android)', 'Linux', 5)).toBe(true);
  });

  it('désactive sur desktop', () => {
    expect(shouldUsePlaybackConvert('Mozilla/5.0 (Macintosh)', 'MacIntel', 0)).toBe(false);
  });
});
