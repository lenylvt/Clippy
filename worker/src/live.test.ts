import { describe, expect, it } from 'vitest';

const WORKER_URL = 'https://clippy.runtimelayer.workers.dev';

describe('worker live', () => {
  it('expose la galerie et l’API clips', async () => {
    const gallery = await fetch(`${WORKER_URL}/`);
    expect(gallery.status).toBe(200);
    expect(gallery.headers.get('content-type')).toContain('text/html');

    const api = await fetch(`${WORKER_URL}/api/clips`);
    expect(api.status).toBe(200);
    const data = await api.json();
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.videos)).toBe(true);
  }, 15_000);
});
