import { describe, expect, it, vi } from 'vitest';
import '../lib/config.js';
import '../lib/semver.js';
import '../lib/update-check.js';

describe('update-check', () => {
  it('marque available quand remote > local', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        version: '0.2.7',
        installUrl: 'https://clippy.runtimelayer.workers.dev/install',
        zipUrl: 'https://clippy.runtimelayer.workers.dev/extension.zip',
      }),
    }));

    const state = await globalThis.checkExtensionUpdate(
      'https://clippy.runtimelayer.workers.dev',
      '0.2.6',
      { fetch: fetchFn },
    );

    expect(state.available).toBe(true);
    expect(state.remoteVersion).toBe('0.2.7');
    expect(state.localVersion).toBe('0.2.6');
    expect(state.installUrl).toContain('/install');
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('available false si déjà à jour', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        version: '0.2.6',
        installUrl: 'https://clippy.runtimelayer.workers.dev/install',
        zipUrl: 'https://clippy.runtimelayer.workers.dev/extension.zip',
      }),
    }));

    const state = await globalThis.checkExtensionUpdate(
      'https://clippy.runtimelayer.workers.dev',
      '0.2.6',
      { fetch: fetchFn },
    );
    expect(state.available).toBe(false);
  });
});
