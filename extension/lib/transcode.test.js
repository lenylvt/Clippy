import { describe, expect, it } from 'vitest';
import './transcode.js';

describe('needsMp4Conversion', () => {
  it('retourne false pour mp4', () => {
    expect(needsMp4Conversion(new Blob([], { type: 'video/mp4' }))).toBe(false);
  });

  it('retourne true pour webm', () => {
    expect(needsMp4Conversion(new Blob([], { type: 'video/webm' }))).toBe(true);
  });
});
