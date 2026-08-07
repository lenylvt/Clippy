import { describe, expect, it } from 'vitest';
import {
  extensionVersion,
  handleInstall,
  INSTALL_PATH,
  publicOrigin,
} from '../src/routes/install';

describe('install route', () => {
  it('expose le chemin /install', () => {
    expect(INSTALL_PATH).toBe('/install');
  });

  it('redirige /install vers /install/', () => {
    const res = handleInstall(new Request('https://clippy.runtimelayer.workers.dev/install'));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://clippy.runtimelayer.workers.dev/install/');
  });

  it('lit EXTENSION_VERSION et PUBLIC_ORIGIN', () => {
    expect(extensionVersion({ EXTENSION_VERSION: '1.2.3' })).toBe('1.2.3');
    expect(extensionVersion({})).toBe('0.0.0');
    expect(
      publicOrigin(
        { PUBLIC_ORIGIN: 'https://clippy.runtimelayer.workers.dev/' },
        'https://ignored.example/install',
      ),
    ).toBe('https://clippy.runtimelayer.workers.dev');
  });
});
