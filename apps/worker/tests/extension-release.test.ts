import { describe, expect, it, vi } from 'vitest';
import {
  EXTENSION_API_PATH,
  EXTENSION_ZIP_PATH,
  handleExtensionApi,
  handleExtensionZip,
} from '../src/routes/extension-release';
import { EXTENSION_ZIP_R2_KEY } from '../src/routes/install';

describe('extension release', () => {
  it('expose les chemins publics', () => {
    expect(EXTENSION_API_PATH).toBe('/api/extension');
    expect(EXTENSION_ZIP_PATH).toBe('/extension.zip');
    expect(EXTENSION_ZIP_R2_KEY).toBe('releases/clippy-extension.zip');
  });

  it('GET /api/extension renvoie version + urls', async () => {
    const env = {
      EXTENSION_VERSION: '0.2.6',
      PUBLIC_ORIGIN: 'https://clippy.runtimelayer.workers.dev',
      PUBLIC_ORIGINS: 'https://clippy.runtimelayer.workers.dev',
    };
    const res = handleExtensionApi(
      new Request('https://clippy.runtimelayer.workers.dev/api/extension', {
        headers: { Origin: 'https://clippy.runtimelayer.workers.dev' },
      }),
      env as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      version: '0.2.6',
      installUrl: 'https://clippy.runtimelayer.workers.dev/install/',
      zipUrl: 'https://clippy.runtimelayer.workers.dev/extension.zip',
    });
  });

  it('GET /extension.zip 404 si absent de R2', async () => {
    const env = {
      CLIPS: {
        get: vi.fn(async () => null),
      },
      PUBLIC_ORIGINS: 'https://clippy.runtimelayer.workers.dev',
    };
    const res = await handleExtensionZip(
      new Request('https://clippy.runtimelayer.workers.dev/extension.zip'),
      env as never,
    );
    expect(res.status).toBe(404);
    expect(env.CLIPS.get).toHaveBeenCalledWith(EXTENSION_ZIP_R2_KEY);
  });

  it('GET /extension.zip streame le zip R2', async () => {
    const body = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const env = {
      CLIPS: {
        get: vi.fn(async () => ({
          body,
          size: body.byteLength,
          httpEtag: '"abc"',
          etag: 'abc',
        })),
      },
      PUBLIC_ORIGINS: 'https://clippy.runtimelayer.workers.dev',
    };
    const res = await handleExtensionZip(
      new Request('https://clippy.runtimelayer.workers.dev/extension.zip'),
      env as never,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toContain('clippy-extension.zip');
    expect(res.headers.get('Content-Length')).toBe('4');
  });
});
