import { describe, expect, it } from 'vitest';
import './clip-format.js';

describe('clipExtensionFromMime', () => {
  it('détecte mp4', () => {
    expect(clipExtensionFromMime('video/mp4')).toBe('mp4');
  });

  it('défaut webm', () => {
    expect(clipExtensionFromMime('video/webm')).toBe('webm');
  });
});
