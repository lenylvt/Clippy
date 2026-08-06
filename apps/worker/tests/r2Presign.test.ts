import { describe, expect, it } from 'vitest';
import { canPresignR2, presignR2Put } from '../src/http/r2Presign';

describe('r2Presign', () => {
  it('canPresignR2 exige les 3 secrets non vides (trim)', () => {
    expect(canPresignR2({})).toBe(false);
    expect(canPresignR2({ R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b' })).toBe(false);
    expect(
      canPresignR2({
        R2_ACCOUNT_ID: 'a',
        R2_ACCESS_KEY_ID: 'b',
        R2_SECRET_ACCESS_KEY: 'c',
      }),
    ).toBe(true);
    expect(
      canPresignR2({
        R2_ACCOUNT_ID: '   ',
        R2_ACCESS_KEY_ID: 'b',
        R2_SECRET_ACCESS_KEY: 'c',
      }),
    ).toBe(false);
  });

  it('génère une URL PUT signée avec les query AWS4 (TTL défaut 900)', async () => {
    const url = await presignR2Put({
      accountId: 'acct123',
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKey: 'secret',
      bucket: 'clippy-clips',
      key: 'clips/vid/file.mp4',
      contentType: 'video/mp4',
    });

    const parsed = new URL(url);
    expect(parsed.hostname).toBe('acct123.r2.cloudflarestorage.com');
    expect(parsed.pathname).toBe('/clippy-clips/clips/vid/file.mp4');
    expect(parsed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('900');
  });

  it('accepte expiresSeconds explicite dans les bornes', async () => {
    const url = await presignR2Put({
      accountId: 'acct123',
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKey: 'secret',
      bucket: 'clippy-clips',
      key: 'clips/vid/file.mp4',
      expiresSeconds: 600,
    });
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('600');
  });

  it('rejette expiresSeconds hors bornes', async () => {
    await expect(
      presignR2Put({
        accountId: 'a',
        accessKeyId: 'b',
        secretAccessKey: 'c',
        bucket: 'clippy-clips',
        key: 'clips/a.mp4',
        expiresSeconds: 0,
      }),
    ).rejects.toThrow('invalid_expires_seconds');

    await expect(
      presignR2Put({
        accountId: 'a',
        accessKeyId: 'b',
        secretAccessKey: 'c',
        bucket: 'clippy-clips',
        key: 'clips/a.mp4',
        expiresSeconds: 604_801,
      }),
    ).rejects.toThrow('invalid_expires_seconds');
  });

  it('rejette contentType invalide', async () => {
    await expect(
      presignR2Put({
        accountId: 'a',
        accessKeyId: 'b',
        secretAccessKey: 'c',
        bucket: 'clippy-clips',
        key: 'clips/a.mp4',
        contentType: 'video/mp4\nhost:evil',
      }),
    ).rejects.toThrow('invalid_content_type');
  });

  it('rejette key R2 invalide', async () => {
    await expect(
      presignR2Put({
        accountId: 'a',
        accessKeyId: 'b',
        secretAccessKey: 'c',
        bucket: 'clippy-clips',
        key: '',
      }),
    ).rejects.toThrow('invalid_r2_key');

    await expect(
      presignR2Put({
        accountId: 'a',
        accessKeyId: 'b',
        secretAccessKey: 'c',
        bucket: 'clippy-clips',
        key: 'clips//file.mp4',
      }),
    ).rejects.toThrow('invalid_r2_key');

    await expect(
      presignR2Put({
        accountId: 'a',
        accessKeyId: 'b',
        secretAccessKey: 'c',
        bucket: 'clippy-clips',
        key: '../etc/passwd',
      }),
    ).rejects.toThrow('invalid_r2_key');
  });
});
