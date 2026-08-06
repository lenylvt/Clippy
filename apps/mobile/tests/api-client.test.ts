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
  Platform: { OS: 'ios' },
}));

import { requestOtp, verifyOtp } from '../src/api/auth';
import {
  __resetApiInflightForTests,
  api,
  ApiError,
  isApiError,
  setOnUnauthorized,
} from '../src/api/client';
import { normalizeClaimCode } from '../src/api/pairing';
import { resolvePushPlatform } from '../src/api/push';

describe('api client', () => {
  beforeEach(() => {
    __resetApiInflightForTests();
    setOnUnauthorized(null);
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('exige ok === true et parse JSON strict', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response('{"hello":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(api('/api/me', { token: 't', retries: 0 })).rejects.toMatchObject({
      code: 'missing_ok',
      kind: 'api',
    });

    fetchMock.mockResolvedValueOnce(
      new Response('not-json', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(api('/api/me', { token: 't', retries: 0 })).rejects.toMatchObject({
      code: 'invalid_json',
      kind: 'parse',
    });
  });

  it('expose ApiError typé (status, code) et notifie 401', async () => {
    const onUnauthorized = vi.fn();
    setOnUnauthorized(onUnauthorized);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(api('/api/me', { token: 't', retries: 0 })).rejects.toSatisfy((err: unknown) => {
      expect(isApiError(err)).toBe(true);
      const e = err as ApiError;
      expect(e.status).toBe(401);
      expect(e.code).toBe('unauthorized');
      expect(e.isUnauthorized).toBe(true);
      return true;
    });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('retry transient + honore Retry-After', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: 'busy' }), {
          status: 503,
          headers: { 'content-type': 'application/json', 'Retry-After': '0' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, user: { id: '1', email: 'a@b.c' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const result = await api<{ ok: true; user: { id: string } }>('/api/me', {
      token: 't',
      retries: 2,
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('mappe les erreurs réseau', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(api('/api/me', { token: 't', retries: 0 })).rejects.toMatchObject({
      kind: 'network',
      code: 'network_error',
    });
  });

  it('déduplique les GET in-flight', async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.mocked(fetch).mockImplementationOnce(() => fetchPromise);

    const a = api<{ ok: true }>('/api/me/clips', { token: 't', retries: 0 });
    const b = api<{ ok: true }>('/api/me/clips', { token: 't', retries: 0 });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    resolveFetch(
      new Response(JSON.stringify({ ok: true, clips: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toEqual(rb);
  });

  it('propage AbortSignal utilisateur', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockImplementationOnce((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const pending = api('/api/me', { token: 't', signal: controller.signal, retries: 0, dedupe: false });
    controller.abort();
    await expect(pending).rejects.toSatisfy((err: unknown) => {
      return err instanceof Error && err.name === 'AbortError';
    });
  });

  it('envoie Authorization même si token vide (string)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await api('/api/auth/logout', { method: 'POST', token: '', retries: 0 });
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ');
  });
});

describe('pairing / push helpers', () => {
  it('normalise le claim code', () => {
    expect(normalizeClaimCode('  ab12cd34  ')).toBe('AB12CD34');
    expect(normalizeClaimCode('clippy://pair?code=zz99aa11')).toBe('ZZ99AA11');
  });

  it('résout platform depuis OS', () => {
    expect(resolvePushPlatform('ios')).toBe('ios');
    expect(resolvePushPlatform('android')).toBe('android');
    expect(resolvePushPlatform('windows')).toBe('ios');
  });
});

describe('auth guards', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejette un OTP mal formé sans fetch', async () => {
    await expect(verifyOtp('a@b.c', '12')).rejects.toMatchObject({
      code: 'invalid_otp_format',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('normalise email avant request-otp', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await requestOtp('  Foo@Bar.COM ');
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ email: 'foo@bar.com' });
  });
});
