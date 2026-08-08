import { describe, expect, it } from 'vitest';
import {
  ADMIN_COOKIE,
  adminCookieHeader,
  clearAdminCookieHeader,
  extractAdminCredential,
  requireAdmin,
} from '../src/admin/requireAdmin';
import type { Env } from '../src/types';

function envWith(secret?: string): Env {
  return { ADMIN_SECRET: secret } as Env;
}

describe('requireAdmin', () => {
  it('rejects missing secret config', () => {
    const req = new Request('https://x', {
      headers: { Authorization: 'Bearer abc' },
    });
    expect(requireAdmin(req, envWith(undefined))).toBe(false);
  });

  it('rejects wrong bearer', () => {
    const req = new Request('https://x', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(requireAdmin(req, envWith('Leny1500'))).toBe(false);
  });

  it('accepts short secrets like Leny1500 via Bearer', () => {
    const secret = 'Leny1500';
    const req = new Request('https://x', {
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect(requireAdmin(req, envWith(secret))).toBe(true);
  });

  it('accepts matching HttpOnly cookie', () => {
    const secret = 'Leny1500';
    const req = new Request('https://x', {
      headers: { Cookie: `${ADMIN_COOKIE}=${encodeURIComponent(secret)}` },
    });
    expect(requireAdmin(req, envWith(secret))).toBe(true);
  });

  it('extractAdminCredential prefers Bearer over cookie', () => {
    const req = new Request('https://x', {
      headers: {
        Authorization: 'Bearer from-header',
        Cookie: `${ADMIN_COOKIE}=from-cookie`,
      },
    });
    expect(extractAdminCredential(req)).toBe('from-header');
  });

  it('builds cookie headers with HttpOnly Secure SameSite', () => {
    expect(adminCookieHeader('Leny1500')).toContain('HttpOnly');
    expect(adminCookieHeader('Leny1500')).toContain('Secure');
    expect(adminCookieHeader('Leny1500')).toContain('SameSite=Lax');
    expect(clearAdminCookieHeader()).toContain('Max-Age=0');
  });
});
