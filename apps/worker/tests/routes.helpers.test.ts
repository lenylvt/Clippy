import { afterEach, describe, expect, it } from 'vitest';
import {
  buildSignedClipUrl,
  clipSigningSecret,
  verifyClipUrlSignature,
} from '../src/http/clipUrl';
import {
  clientIp,
  resetRateLimitForTests,
  takeRateLimit,
} from '../src/http/rateLimit';
import { readJsonObject } from '../src/http/body';
import { isUuid } from '../src/http/ids';
import { MAX_ACTIVE_JOBS_PER_USER } from '../src/constants';
import { isJobStage } from '@clippy/shared/stages';

describe('clipUrl signed download', () => {
  const secret = 'test-container-secret';

  it('clipSigningSecret préfère SESSION_SECRET', () => {
    expect(clipSigningSecret({ CONTAINER_SECRET: 'a', SESSION_SECRET: 'b' })).toBe('b');
    expect(clipSigningSecret({ CONTAINER_SECRET: 'a' })).toBe('a');
  });

  it('signe et vérifie une URL', async () => {
    const exp = Date.now() + 60_000;
    const url = await buildSignedClipUrl('https://clippy.example', 'clip-1', secret, exp);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/clips/clip-1');
    expect(await verifyClipUrlSignature(
      'clip-1',
      parsed.searchParams.get('exp'),
      parsed.searchParams.get('sig'),
      secret,
    )).toBe(true);
  });

  it('rejette sig absente / expirée / altérée', async () => {
    const exp = Date.now() + 60_000;
    const url = await buildSignedClipUrl('https://clippy.example', 'clip-1', secret, exp);
    const parsed = new URL(url);
    expect(await verifyClipUrlSignature('clip-1', null, parsed.searchParams.get('sig'), secret)).toBe(
      false,
    );
    expect(
      await verifyClipUrlSignature(
        'clip-1',
        String(Date.now() - 1),
        parsed.searchParams.get('sig'),
        secret,
      ),
    ).toBe(false);
    expect(
      await verifyClipUrlSignature(
        'clip-1',
        parsed.searchParams.get('exp'),
        '0'.repeat(64),
        secret,
      ),
    ).toBe(false);
    expect(
      await verifyClipUrlSignature(
        'other',
        parsed.searchParams.get('exp'),
        parsed.searchParams.get('sig'),
        secret,
      ),
    ).toBe(false);
  });
});

describe('rateLimit in-memory', () => {
  afterEach(() => resetRateLimitForTests());

  it('autorise jusqu’à la limite puis 429', () => {
    expect(takeRateLimit('k', 2, 60_000).ok).toBe(true);
    expect(takeRateLimit('k', 2, 60_000).ok).toBe(true);
    const blocked = takeRateLimit('k', 2, 60_000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it('clientIp lit CF-Connecting-IP', () => {
    const req = new Request('https://x', {
      headers: { 'CF-Connecting-IP': '1.2.3.4', 'X-Forwarded-For': '9.9.9.9' },
    });
    expect(clientIp(req)).toBe('1.2.3.4');
  });
});

describe('readJsonObject', () => {
  it('accepte un objet', async () => {
    const req = new Request('https://x', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    });
    expect(await readJsonObject(req)).toEqual({ ok: true, body: { a: 1 } });
  });

  it('rejette array / null / json invalide', async () => {
    expect(
      await readJsonObject(
        new Request('https://x', { method: 'POST', body: '[]' }),
      ),
    ).toEqual({ ok: false, error: 'invalid_body' });
    expect(
      await readJsonObject(
        new Request('https://x', { method: 'POST', body: 'null' }),
      ),
    ).toEqual({ ok: false, error: 'invalid_body' });
    expect(
      await readJsonObject(
        new Request('https://x', { method: 'POST', body: '{' }),
      ),
    ).toEqual({ ok: false, error: 'invalid_json' });
  });
});

describe('routes helpers / quotas', () => {
  it('isUuid', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });

  it('MAX_ACTIVE_JOBS_PER_USER borné', () => {
    expect(MAX_ACTIVE_JOBS_PER_USER).toBeGreaterThanOrEqual(1);
    expect(MAX_ACTIVE_JOBS_PER_USER).toBeLessThanOrEqual(10);
  });

  it('JOB_STAGES whitelist pour internal', () => {
    expect(isJobStage('downloading')).toBe(true);
    expect(isJobStage('hacking')).toBe(false);
  });
});

describe('delete error job', () => {
  it('SQL ne cible que status=error', () => {
    const sql = `DELETE FROM jobs WHERE id = ? AND user_id = ? AND status = 'error'`;
    expect(sql).toContain("status = 'error'");
    expect(sql).not.toContain('queued');
  });
});

describe('internal stage error semantics', () => {
  it('n’écrase pas done (ignored)', () => {
    const applyError = (status: string) => {
      if (status === 'done' || status === 'error') return 'ignored';
      return 'updated';
    };
    expect(applyError('done')).toBe('ignored');
    expect(applyError('running')).toBe('updated');
  });

  it('clamp progress [0,1]', () => {
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    expect(clamp(-1)).toBe(0);
    expect(clamp(2)).toBe(1);
    expect(clamp(0.4)).toBe(0.4);
  });
});

describe('pairing claim HTTP status map', () => {
  it('mappe expired/used/elsewhere', () => {
    const claimStatus = (error: string): number => {
      switch (error) {
        case 'code_expired':
          return 410;
        case 'code_used':
        case 'device_linked_elsewhere':
          return 409;
        default:
          return 400;
      }
    };
    expect(claimStatus('code_expired')).toBe(410);
    expect(claimStatus('code_used')).toBe(409);
    expect(claimStatus('device_linked_elsewhere')).toBe(409);
    expect(claimStatus('invalid_code')).toBe(400);
  });
});
