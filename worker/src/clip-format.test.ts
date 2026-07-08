import { describe, expect, it } from 'vitest';
import { clipExtensionFromMime } from './clip-format';

describe('clipExtensionFromMime', () => {
  it('retourne mp4 pour le mime video/mp4', () => {
    expect(clipExtensionFromMime('video/mp4')).toBe('mp4');
  });

  it('retourne webm par défaut', () => {
    expect(clipExtensionFromMime('video/webm')).toBe('webm');
  });
});
