import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import '../lib/config.js';
import {
  createServerJob,
  getServerJob,
  pollServerJob,
  labelForJobError,
  normalizeWorkerUrl,
} from '../lib/jobs-client.js';

describe('assertWorkerUrl / normalizeWorkerUrl', () => {
  it('accepte l’URL prod par défaut', () => {
    expect(assertWorkerUrl('https://clippy.runtimelayer.workers.dev')).toBe(
      'https://clippy.runtimelayer.workers.dev',
    );
    expect(normalizeWorkerUrl('https://clippy.runtimelayer.workers.dev/')).toBe(
      'https://clippy.runtimelayer.workers.dev',
    );
  });

  it('accepte localhost http', () => {
    expect(assertWorkerUrl('http://localhost:8787')).toBe('http://localhost:8787');
  });

  it('rejette un autre workers.dev (exfiltration Bearer)', () => {
    expect(() => assertWorkerUrl('https://evil.workers.dev')).toThrow('invalid_worker_url');
  });

  it('rejette http non-local', () => {
    expect(() => assertWorkerUrl('http://clippy.runtimelayer.workers.dev')).toThrow(
      'invalid_worker_url',
    );
  });
});

describe('labelForJobError', () => {
  it('préserve pairing_required en FR', () => {
    expect(labelForJobError('pairing_required')).toBe('Relie l’app (réglages → QR)');
  });

  it('mappe les codes courants', () => {
    expect(labelForJobError('clip_too_long')).toBe('Clip trop long');
    expect(labelForJobError('job_timeout')).toBe('Délai dépassé');
    expect(labelForJobError('network_error')).toBe('Réseau indisponible');
  });

  it('ne renvoie pas le code brut pour un inconnu', () => {
    expect(labelForJobError('weird_code_xyz')).toBe('Échec');
  });
});

describe('createServerJob / getServerJob', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({ ok: true, jobId: 'job_1', stage: 'queued', progress: 0 }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('valide workerUrl avant d’envoyer le Bearer', async () => {
    await expect(
      createServerJob('https://evil.workers.dev', 'token-secret', {
        videoId: 'DkCkIk3MkB8',
        videoTitle: 't',
        youtubeUrl: 'https://www.youtube.com/watch?v=DkCkIk3MkB8',
        clipStart: 0,
        clipEnd: 10,
      }),
    ).rejects.toThrow('invalid_worker_url');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('crée un job sur l’URL allowlistée', async () => {
    const data = await createServerJob(
      'https://clippy.runtimelayer.workers.dev',
      'token-secret',
      {
        videoId: 'DkCkIk3MkB8',
        videoTitle: 't',
        youtubeUrl: 'https://www.youtube.com/watch?v=DkCkIk3MkB8',
        clipStart: 0,
        clipEnd: 10,
      },
    );
    expect(data.jobId).toBe('job_1');
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = /** @type {[string, RequestInit]} */ (fetch.mock.calls[0]);
    expect(url).toBe('https://clippy.runtimelayer.workers.dev/api/jobs');
    expect(init.headers.Authorization).toBe('Bearer token-secret');
    expect(init.credentials).toBe('omit');
  });

  it('exige deviceToken sur getServerJob', async () => {
    await expect(
      getServerJob('https://clippy.runtimelayer.workers.dev', '', 'job_1'),
    ).rejects.toThrow('missing_device_token');
  });

  it('retry sur 503 puis réussit', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          return {
            ok: false,
            status: 503,
            headers: new Headers(),
            text: async () => JSON.stringify({ ok: false, error: 'unavailable' }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({ ok: true, jobId: 'job_2', stage: 'queued', progress: 0 }),
        };
      }),
    );

    const data = await createServerJob(
      'https://clippy.runtimelayer.workers.dev',
      'tok',
      {
        videoId: 'DkCkIk3MkB8',
        videoTitle: 't',
        youtubeUrl: 'https://www.youtube.com/watch?v=DkCkIk3MkB8',
        clipStart: 0,
        clipEnd: 10,
      },
    );
    expect(data.jobId).toBe('job_2');
    expect(calls).toBe(2);
  });

  it('ne retry pas pairing_required (403)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        headers: new Headers(),
        text: async () => JSON.stringify({ ok: false, error: 'pairing_required' }),
      })),
    );

    await expect(
      createServerJob('https://clippy.runtimelayer.workers.dev', 'tok', {
        videoId: 'DkCkIk3MkB8',
        videoTitle: 't',
        youtubeUrl: 'https://www.youtube.com/watch?v=DkCkIk3MkB8',
        clipStart: 0,
        clipEnd: 10,
      }),
    ).rejects.toThrow('pairing_required');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('respecte AbortSignal sur create', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      }),
    );
    const ac = new AbortController();
    ac.abort();
    await expect(
      createServerJob(
        'https://clippy.runtimelayer.workers.dev',
        'tok',
        {
          videoId: 'DkCkIk3MkB8',
          videoTitle: 't',
          youtubeUrl: 'https://www.youtube.com/watch?v=DkCkIk3MkB8',
          clipStart: 0,
          clipEnd: 10,
        },
        { signal: ac.signal },
      ),
    ).rejects.toThrow('aborted');
  });
});

describe('pollServerJob', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('respecte AbortSignal', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              ok: true,
              job: { id: 'j', status: 'running', stage: 'downloading', progress: 0.1 },
            }),
        };
      }),
    );

    const ac = new AbortController();
    const poll = pollServerJob(
      'https://clippy.runtimelayer.workers.dev',
      'tok',
      'job_1',
      () => {},
      { intervalMs: 1000, signal: ac.signal },
    );
    ac.abort();
    await expect(poll).rejects.toThrow('aborted');
    expect(calls).toBeLessThanOrEqual(1);
  });

  it('termine sur stage done avec clipId+url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({
            ok: true,
            job: {
              id: 'j',
              status: 'done',
              stage: 'done',
              progress: 1,
              clipId: 'c1',
              url: 'https://example.com/c.mp4',
            },
          }),
      })),
    );

    const job = await pollServerJob(
      'https://clippy.runtimelayer.workers.dev',
      'tok',
      'job_1',
      () => {},
      { intervalMs: 1000 },
    );
    expect(job.clipId).toBe('c1');
  });

  it('refuse done sans clipId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({
            ok: true,
            job: {
              id: 'j',
              status: 'done',
              stage: 'done',
              progress: 1,
            },
          }),
      })),
    );

    await expect(
      pollServerJob('https://clippy.runtimelayer.workers.dev', 'tok', 'job_1', () => {}, {
        intervalMs: 1000,
      }),
    ).rejects.toThrow('missing_clip_result');
  });

  it('continue après erreur réseau transitoire', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls <= 2) {
          throw new TypeError('Failed to fetch');
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              ok: true,
              job: {
                id: 'j',
                status: 'done',
                stage: 'done',
                progress: 1,
                clipId: 'c1',
                url: 'https://example.com/c.mp4',
              },
            }),
        };
      }),
    );

    const poll = pollServerJob(
      'https://clippy.runtimelayer.workers.dev',
      'tok',
      'job_1',
      () => {},
      { intervalMs: 1000, timeoutMs: 60_000 },
    );

    // Advance through create retries + poll backoff sleeps.
    await vi.runAllTimersAsync();
    const job = await poll;
    expect(job.clipId).toBe('c1');
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it('intervalle poll ≥ 1s', async () => {
    vi.useFakeTimers();
    const timestamps = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        timestamps.push(Date.now());
        if (timestamps.length >= 3) {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            text: async () =>
              JSON.stringify({
                ok: true,
                job: {
                  id: 'j',
                  status: 'done',
                  stage: 'done',
                  progress: 1,
                  clipId: 'c1',
                  url: 'https://example.com/c.mp4',
                },
              }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              ok: true,
              job: { id: 'j', status: 'running', stage: 'downloading', progress: 0.2 },
            }),
        };
      }),
    );

    const poll = pollServerJob(
      'https://clippy.runtimelayer.workers.dev',
      'tok',
      'job_1',
      () => {},
      { intervalMs: 1000 },
    );
    await vi.runAllTimersAsync();
    await poll;
    expect(timestamps.length).toBeGreaterThanOrEqual(3);
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(1000);
  });
});
