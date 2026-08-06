import { describe, expect, it } from 'vitest';
import { isValidEmail, normalizeEmail, randomDigits, randomPairingCode, sha256Hex } from '../src/auth/crypto';
import { OTP_FROM_EMAIL, OTP_TTL_MS, PAIRING_TTL_MS, SESSION_TTL_MS } from '../src/constants';

describe('crypto helpers', () => {
  it('normalise et valide les emails', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('bad')).toBe(false);
  });

  it('génère un OTP 6 chiffres', () => {
    const code = randomDigits(6);
    expect(code).toMatch(/^\d{6}$/);
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
});

describe('auth constants', () => {
  it('utilise clippy@lenylvt.cc et TTL courts', () => {
    expect(OTP_FROM_EMAIL).toBe('clippy@lenylvt.cc');
    expect(OTP_TTL_MS).toBe(10 * 60 * 1000);
    expect(PAIRING_TTL_MS).toBe(2 * 60 * 1000);
    expect(SESSION_TTL_MS).toBeGreaterThan(OTP_TTL_MS);
  });
});
