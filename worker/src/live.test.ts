import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKER_URL } from '../../shared/config.js';

const liveUrl = process.env.CLIPPY_LIVE_URL ?? DEFAULT_WORKER_URL;

describe.skipIf(!process.env.CLIPPY_LIVE)('worker live', () => {
  it('expose la galerie et l’API clips', async () => {
    const gallery = await fetch(`${liveUrl}/`);
    expect(gallery.status).toBe(200);
    expect(gallery.headers.get('content-type')).toContain('text/html');

    const api = await fetch(`${liveUrl}/api/clips`);
    expect(api.status).toBe(200);
    const data = await api.json();
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.videos)).toBe(true);
  }, 15_000);
});
