import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      version: '0.1.0',
      extra: { apiUrl: 'https://api.test' },
    },
    manifest: null,
  },
}));

import { pollMyJobs } from '../src/api/jobs';

describe('pollMyJobs', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('s’arrête quand la liste active est vide', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, jobs: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const onUpdate = vi.fn();
    const jobs = await pollMyJobs('tok', { onUpdate, intervalMs: 100 });
    expect(jobs).toEqual([]);
    expect(onUpdate).toHaveBeenCalledWith([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('poll jusqu’à whileActive vide', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            jobs: [
              {
                id: 'j1',
                status: 'running',
                stage: 'downloading',
                progress: 0.2,
                videoId: 'v',
                videoTitle: 't',
                youtubeUrl: 'u',
                clipStart: 0,
                clipEnd: 1,
                clipId: null,
                error: null,
                createdAt: 1,
                updatedAt: 1,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, jobs: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const onUpdate = vi.fn();
    const result = await pollMyJobs('tok', { onUpdate, intervalMs: 10 });
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(result).toEqual([]);
  });
});
