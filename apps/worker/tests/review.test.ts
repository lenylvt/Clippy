import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isReviewAccount, isReviewOtp, reviewOtp } from '../src/review/auth';
import { REVIEW_DEVICE_TOKEN } from '../src/review/constants';
import { reviewDemoMp4Bytes } from '../src/review/demoMp4';

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

import { requestOtp, verifyOtp, type AuthEnv } from '../src/auth/otp';

describe('review auth helpers', () => {
  it('normalise email et valide OTP 6 chiffres', () => {
    const env = { REVIEW_EMAIL: '  Review@Clippy.app ', REVIEW_OTP: '000000' };
    expect(isReviewAccount(env, 'review@clippy.app')).toBe(true);
    expect(isReviewAccount(env, 'other@clippy.app')).toBe(false);
    expect(reviewOtp(env)).toBe('000000');
    expect(reviewOtp({ REVIEW_OTP: '12' })).toBeNull();
    expect(isReviewOtp(env, 'review@clippy.app', '000000')).toBe(true);
    expect(isReviewOtp(env, 'review@clippy.app', '111111')).toBe(false);
  });

  it('expose un device_token stable pour exclure la file', () => {
    expect(REVIEW_DEVICE_TOKEN).toBe('clippy-app-store-review');
  });
});

describe('review demo mp4', () => {
  it('décode un MP4 non vide (Save to Photos)', () => {
    const bytes = reviewDemoMp4Bytes();
    expect(bytes.byteLength).toBeGreaterThan(1024);
    expect(String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!)).toBe('ftyp');
  });
});

describe('OTP App Store review bypass', () => {
  let send: ReturnType<typeof vi.fn>;

  function mockDb() {
    return {
      prepare: vi.fn(() => {
        const stmt = {
          bind: vi.fn(() => stmt),
          first: vi.fn(async () => null),
          run: vi.fn(async () => ({ success: true })),
        };
        return stmt;
      }),
    };
  }

  function makeEnv(extra: Partial<AuthEnv> = {}): AuthEnv {
    return {
      DB: mockDb(),
      CONTAINER_SECRET: 'container',
      EMAIL: { send },
      OTP_PEPPER: 'pepper',
      ...extra,
    } as unknown as AuthEnv;
  }

  beforeEach(() => {
    send = vi.fn(async () => ({ messageId: 'm1' }));
    getOtp.mockReset();
    upsertOtp.mockReset();
    deleteOtp.mockReset();
    getUserByEmail.mockReset();
    createUser.mockReset();
    createSession.mockReset();
    getUserByEmail.mockResolvedValue(null);
    createUser.mockImplementation(async (_env: AuthEnv, email: string) => ({
      id: 'review-user',
      email,
      created_at: Date.now(),
    }));
    createSession.mockResolvedValue('b'.repeat(64));
  });

  it('requestOtp ne send pas de mail pour REVIEW_EMAIL', async () => {
    const env = makeEnv({
      REVIEW_EMAIL: 'review@clippy.app',
      REVIEW_OTP: '000000',
    });
    expect(await requestOtp(env, 'Review@Clippy.app')).toEqual({ ok: true });
    expect(send).not.toHaveBeenCalled();
    expect(upsertOtp).not.toHaveBeenCalled();
  });

  it('verifyOtp accepte l’OTP fixe à vie', async () => {
    const env = makeEnv({
      REVIEW_EMAIL: 'review@clippy.app',
      REVIEW_OTP: '000000',
    });
    const ok = await verifyOtp(env, 'review@clippy.app', '000000');
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.user.email).toBe('review@clippy.app');
      expect(ok.token).toHaveLength(64);
    }
    expect(getOtp).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledOnce();
  });

  it('verifyOtp refuse un mauvais code review', async () => {
    const env = makeEnv({
      REVIEW_EMAIL: 'review@clippy.app',
      REVIEW_OTP: '000000',
    });
    const bad = await verifyOtp(env, 'review@clippy.app', '111111');
    expect(bad).toEqual({ ok: false, error: 'otp_invalid', status: 400 });
  });
});
