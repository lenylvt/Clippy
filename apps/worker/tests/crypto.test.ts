import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OTP_LENGTH,
  escapeHtml,
  hmacSha256Hex,
  isValidEmail,
  normalizeEmail,
  randomDigits,
  randomPairingCode,
  randomToken,
  sha256Hex,
  timingSafeEqualStr,
} from '../src/auth/crypto';
import { extractBearerToken, requireInternalSecret } from '../src/auth/bearer';
import {
  OTP_FROM_EMAIL,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  PAIRING_TTL_MS,
  SESSION_TTL_MS,
} from '../src/constants';

const getOtp = vi.hoisted(() => vi.fn());
const upsertOtp = vi.hoisted(() => vi.fn());
const deleteOtp = vi.hoisted(() => vi.fn());
const getUserByEmail = vi.hoisted(() => vi.fn());
const createUser = vi.hoisted(() => vi.fn());
const createSession = vi.hoisted(() => vi.fn());

vi.mock('../src/db/users', () => ({
  getOtp,
  upsertOtp,
  deleteOtp,
  getUserByEmail,
  createUser,
  bumpOtpAttempts: vi.fn(),
}));

vi.mock('../src/db/sessions', () => ({
  createSession,
  deleteSession: vi.fn(),
  getSessionUser: vi.fn(),
}));

import {
  OTP_REQUEST_COOLDOWN_MS,
  hashOtpCode,
  otpTtlMinutes,
  requestOtp,
  verifyOtp,
  type AuthEnv,
} from '../src/auth/otp';

describe('crypto helpers', () => {
  it('normalise NFC et valide les emails', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    const composed = 'café@example.com';
    const decomposed = 'cafe\u0301@example.com';
    expect(normalizeEmail(decomposed)).toBe(normalizeEmail(composed));
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('bad')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
  });

  it('génère un OTP 6 chiffres sans rejet de plage invalide', () => {
    const code = randomDigits(OTP_LENGTH);
    expect(code).toMatch(/^\d{6}$/);
    expect(() => randomDigits(0)).toThrow(RangeError);
  });

  it('génère un code pairing court', () => {
    const code = randomPairingCode(8);
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });

  it('hash SHA-256 de façon déterministe', async () => {
    const a = await sha256Hex('123456');
    const b = await sha256Hex('123456');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('HMAC pepper distinct du SHA-256 nu', async () => {
    const plain = await sha256Hex('123456');
    const mac = await hmacSha256Hex('pepper', '123456');
    expect(mac).not.toBe(plain);
    expect(await hmacSha256Hex('pepper', '123456')).toBe(mac);
  });

  it('timingSafeEqualStr', () => {
    expect(timingSafeEqualStr('abc', 'abc')).toBe(true);
    expect(timingSafeEqualStr('abc', 'abd')).toBe(false);
    expect(timingSafeEqualStr('abc', 'ab')).toBe(false);
  });

  it('escapeHtml échappe les caractères dangereux', () => {
    expect(escapeHtml(`<b>"x"'`)).toBe('&lt;b&gt;&quot;x&quot;&#39;');
  });

  it('randomToken produit du hex', () => {
    expect(randomToken(32)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('auth constants', () => {
  it('utilise clippy@lenylvt.cc et TTL courts', () => {
    expect(OTP_FROM_EMAIL).toBe('clippy@lenylvt.cc');
    expect(OTP_TTL_MS).toBe(10 * 60 * 1000);
    expect(PAIRING_TTL_MS).toBe(2 * 60 * 1000);
    expect(SESSION_TTL_MS).toBeGreaterThan(OTP_TTL_MS);
    expect(otpTtlMinutes()).toBe(10);
    expect(OTP_REQUEST_COOLDOWN_MS).toBe(60_000);
    expect(OTP_MAX_ATTEMPTS).toBe(5);
  });
});

describe('bearer', () => {
  it('extrait un Bearer valide et refuse le format invalide', () => {
    const ok = new Request('https://x', {
      headers: { Authorization: `Bearer ${'a'.repeat(32)}` },
    });
    expect(extractBearerToken(ok)).toBe('a'.repeat(32));
    expect(
      extractBearerToken(
        new Request('https://x', { headers: { Authorization: 'Bearer short' } }),
      ),
    ).toBeNull();
    expect(extractBearerToken(new Request('https://x'))).toBeNull();
  });

  it('compare CONTAINER_SECRET en constant-time', () => {
    const env = { CONTAINER_SECRET: 'super-secret-value' } as AuthEnv;
    expect(
      requireInternalSecret(
        new Request('https://x', { headers: { 'X-Clippy-Internal': 'super-secret-value' } }),
        env,
      ),
    ).toBe(true);
    expect(
      requireInternalSecret(
        new Request('https://x', { headers: { 'X-Clippy-Internal': 'wrong-secret-value!' } }),
        env,
      ),
    ).toBe(false);
  });
});

describe('otp request / verify', () => {
  const pepper = 'test-otp-pepper';
  let send: ReturnType<typeof vi.fn>;
  let otpRow: {
    code_hash: string;
    expires_at: number;
    attempts: number;
    created_at: number;
  } | null;
  let bumpResult: { attempts: number } | null;

  function mockDb() {
    return {
      prepare: vi.fn((sql: string) => {
        const bound: { args: unknown[] } = { args: [] };
        const stmt = {
          bind: vi.fn((...args: unknown[]) => {
            bound.args = args;
            return stmt;
          }),
          first: vi.fn(async () => {
            if (sql.includes('RETURNING attempts')) return bumpResult;
            if (sql.includes('FROM auth_otps')) return otpRow;
            return null;
          }),
          run: vi.fn(async () => ({ success: true })),
        };
        return stmt;
      }),
    };
  }

  function makeEnv(): AuthEnv {
    return {
      DB: mockDb(),
      CONTAINER_SECRET: 'container',
      EMAIL: { send },
      OTP_PEPPER: pepper,
    } as unknown as AuthEnv;
  }

  beforeEach(() => {
    send = vi.fn(async () => ({ messageId: 'm1' }));
    otpRow = null;
    bumpResult = null;
    getOtp.mockReset();
    upsertOtp.mockReset();
    deleteOtp.mockReset();
    getUserByEmail.mockReset();
    createUser.mockReset();
    createSession.mockReset();
    upsertOtp.mockImplementation(async (_env: AuthEnv, email: string, codeHash: string) => {
      otpRow = {
        code_hash: codeHash,
        expires_at: Date.now() + OTP_TTL_MS,
        attempts: 0,
        created_at: Date.now(),
      };
      void email;
    });
    getOtp.mockImplementation(async () => otpRow);
    deleteOtp.mockImplementation(async () => {
      otpRow = null;
    });
    getUserByEmail.mockResolvedValue(null);
    createUser.mockImplementation(async (_env: AuthEnv, email: string) => ({
      id: 'user-1',
      email,
      created_at: Date.now(),
    }));
    createSession.mockResolvedValue('a'.repeat(64));
  });

  it('hashOtpCode utilise le pepper', async () => {
    expect(await hashOtpCode({ OTP_PEPPER: pepper }, '123456')).toBe(
      await hmacSha256Hex(pepper, '123456'),
    );
    expect(await hashOtpCode({}, '123456')).toBeNull();
    expect(await hashOtpCode({ SESSION_SECRET: 'sess' }, '123456')).toBe(
      await hmacSha256Hex('sess', '123456'),
    );
  });

  it('requestOtp : sujet sans code, TTL dérivé, upsert après send', async () => {
    const env = makeEnv();
    const result = await requestOtp(env, 'User@Example.com');
    expect(result).toEqual({ ok: true });
    expect(send).toHaveBeenCalledOnce();
    const msg = send.mock.calls[0]![0] as { subject: string; text: string; html: string };
    expect(msg.subject).toBe('Ton code Clippy');
    expect(msg.subject).not.toMatch(/\d{6}/);
    expect(msg.text).toContain(`Valable ${otpTtlMinutes()} minutes`);
    expect(upsertOtp).toHaveBeenCalledOnce();
    const code = msg.text.match(/: (\d{6})/)![1]!;
    const [, , hash] = upsertOtp.mock.calls[0] as [AuthEnv, string, string];
    expect(hash).toBe(await hmacSha256Hex(pepper, code));
    expect(hash).not.toBe(await sha256Hex(code));
  });

  it('requestOtp ne stocke pas si send échoue', async () => {
    send.mockRejectedValueOnce(new Error('smtp down'));
    const result = await requestOtp(makeEnv(), 'a@b.co');
    expect(result).toEqual({ ok: false, error: 'email_send_failed', status: 502 });
    expect(upsertOtp).not.toHaveBeenCalled();
  });

  it('requestOtp rate-limit cooldown par email', async () => {
    const env = makeEnv();
    expect((await requestOtp(env, 'a@b.co')).ok).toBe(true);
    // otpRow.created_at is now → second request hits cooldown
    const second = await requestOtp(env, 'a@b.co');
    expect(second).toEqual({ ok: false, error: 'rate_limited', status: 429 });
    expect(send).toHaveBeenCalledOnce();
  });

  it('requestOtp refuse de reset un OTP verrouillé', async () => {
    otpRow = {
      code_hash: 'x'.repeat(64),
      expires_at: Date.now() + 60_000,
      attempts: OTP_MAX_ATTEMPTS,
      created_at: Date.now() - OTP_REQUEST_COOLDOWN_MS - 1,
    };
    const result = await requestOtp(makeEnv(), 'a@b.co');
    expect(result).toEqual({ ok: false, error: 'rate_limited', status: 429 });
    expect(send).not.toHaveBeenCalled();
  });

  it('verifyOtp succès + erreurs client uniformes otp_invalid', async () => {
    const env = makeEnv();
    await requestOtp(env, 'a@b.co');
    const code = (send.mock.calls[0]![0] as { text: string }).text.match(/: (\d{6})/)![1]!;

    bumpResult = { attempts: 1 };
    const bad = await verifyOtp(env, 'a@b.co', '000000');
    expect(bad).toEqual({ ok: false, error: 'otp_invalid', status: 400 });

    getOtp.mockResolvedValueOnce(null);
    const missing = await verifyOtp(env, 'nobody@b.co', '123456');
    expect(missing).toEqual({ ok: false, error: 'otp_invalid', status: 400 });

    const ok = await verifyOtp(env, 'a@b.co', code);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.token).toHaveLength(64);
      expect(ok.user.email).toBe('a@b.co');
    }
    expect(createSession).toHaveBeenCalledOnce();
  });

  it('verifyOtp gère la race createUser UNIQUE', async () => {
    const env = makeEnv();
    await requestOtp(env, 'a@b.co');
    const code = (send.mock.calls[0]![0] as { text: string }).text.match(/: (\d{6})/)![1]!;
    getUserByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'user-race',
      email: 'a@b.co',
      created_at: 1,
    });
    createUser.mockRejectedValueOnce(new Error('UNIQUE constraint failed'));
    const ok = await verifyOtp(env, 'a@b.co', code);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.user.id).toBe('user-race');
  });

  it('requestOtp sans pepper → service_unavailable', async () => {
    const env = makeEnv();
    delete (env as { OTP_PEPPER?: string }).OTP_PEPPER;
    const result = await requestOtp(env, 'a@b.co');
    expect(result).toEqual({ ok: false, error: 'service_unavailable', status: 503 });
  });
});
