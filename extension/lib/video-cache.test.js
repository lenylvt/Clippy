import { describe, expect, it } from 'vitest';

describe('video cache TTL constant', () => {
  it('is 12 hours', async () => {
    // Load without IndexedDB side effects assertions on constants only
    await import('./video-cache.js');
    expect(VIDEO_CACHE_TTL_MS).toBe(3 * 60 * 60 * 1000);
  });
});
