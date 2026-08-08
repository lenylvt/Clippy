import { describe, expect, it } from 'vitest';
import { requireAdmin } from '../src/admin/requireAdmin';
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
      headers: { Authorization: 'Bearer wrong-token-value-here!!' },
    });
    expect(requireAdmin(req, envWith('correct-admin-secret-token'))).toBe(false);
  });

  it('accepts matching bearer', () => {
    const secret = 'correct-admin-secret-token';
    const req = new Request('https://x', {
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect(requireAdmin(req, envWith(secret))).toBe(true);
  });
});
