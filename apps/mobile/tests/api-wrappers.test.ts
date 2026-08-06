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

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

import { fetchMyClips } from '../src/api/clips';
import { deleteJob, fetchMyJobs } from '../src/api/jobs';
import { registerPushToken, unregisterPushToken } from '../src/api/push';

describe('api wrappers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('passe limit/cursor en query clips', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, clips: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await fetchMyClips('tok', { limit: 20, cursor: 'abc' });
    const url = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(url).toContain('limit=20');
    expect(url).toContain('cursor=abc');
  });

  it('fetchMyJobs active=1 par défaut', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, jobs: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await fetchMyJobs('tok');
    const url = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(url).toContain('active=1');
  });

  it('deleteJob envoie DELETE /api/jobs/:id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await deleteJob('tok', 'job-1');
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/jobs/job-1');
    expect(init.method).toBe('DELETE');
  });

  it('registerPushToken utilise Platform.OS', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await registerPushToken('auth', 'ExponentPushToken[x]');
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      token: 'ExponentPushToken[x]',
      platform: 'android',
    });
  });

  it('unregisterPushToken envoie DELETE', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await unregisterPushToken('auth', 'ExponentPushToken[x]');
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/me/push-token');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(String(init.body))).toEqual({ token: 'ExponentPushToken[x]' });
  });
});
