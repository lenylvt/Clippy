import { describe, expect, it } from 'vitest';
import './ytdl.js';

describe('ytdl urls', () => {
  it('build info url', () => {
    const url = ytdlInfoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(url).toContain('https://ytdl.openutils.net/api/info');
    expect(url).toContain('url=https');
    expect(decodeURIComponent(url)).toContain('v=dQw4w9WgXcQ');
  });

  it('build stream url with default 1080 only', () => {
    const url = ytdlVideoStreamUrl('https://www.youtube.com/watch?v=abc123');
    expect(url).toContain('/api/stream/video');
    expect(url).toContain('fmt=mp4-1080');
    expect(decodeURIComponent(url)).toContain('v=abc123');
  });
});
