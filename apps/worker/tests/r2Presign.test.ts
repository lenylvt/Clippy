import { describe, expect, it } from 'vitest';
import { canPresignR2, presignR2Put } from '../src/http/r2Presign';

describe('r2Presign', () => {
  it('canPresignR2 exige les 3 secrets', () => {
    expect(canPresignR2({})).toBe(false);
    expect(canPresignR2({ R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b' })).toBe(false);
    expect(
      canPresignR2({
        R2_ACCOUNT_ID: 'a',
        R2_ACCESS_KEY_ID: 'b',
        R2_SECRET_ACCESS_KEY: 'c',
      }),
    ).toBe(true);
  });

  it('génère une URL PUT signée avec les query AWS4', async () => {
    const url = await presignR2Put({
      accountId: 'acct123',
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKey: 'secret',
      bucket: 'clippy-clips',
      key: 'clips/vid/file.mp4',
      contentType: 'video/mp4',
      expiresSeconds: 600,
    });

    const parsed = new URL(url);
    expect(parsed.hostname).toBe('acct123.r2.cloudflarestorage.com');
    expect(parsed.pathname).toBe('/clippy-clips/clips/vid/file.mp4');
    expect(parsed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('600');
  });
});
