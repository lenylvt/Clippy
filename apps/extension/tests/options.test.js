import { describe, expect, it } from 'vitest';
import '../lib/config.js';
import '../options/pairing-helpers.js';

describe('pairing helpers', () => {
  it('valide deepLink clippy://pair', () => {
    expect(globalThis.isValidPairingDeepLink('clippy://pair?code=ABCDEF')).toBe(true);
    expect(globalThis.isValidPairingDeepLink('https://evil.com')).toBe(false);
    expect(globalThis.extractPairingCode('clippy://pair?code=Ab12Cd')).toBe('AB12CD');
  });

  it('allowlist workerUrl', () => {
    expect(globalThis.isAllowedWorkerUrl('https://clippy.runtimelayer.workers.dev')).toBe(true);
    expect(globalThis.isAllowedWorkerUrl('http://localhost:8787')).toBe(true);
    expect(globalThis.isAllowedWorkerUrl('https://evil.com')).toBe(false);
    expect(globalThis.isAllowedWorkerUrl('http://evil.com')).toBe(false);
  });

  it('normalise trailing slash', () => {
    expect(globalThis.normalizeWorkerBase('https://x.workers.dev/')).toBe('https://x.workers.dev');
  });

  it('n’occupe pas le scope partagé (pas de redeclaration avec options.js)', () => {
    expect(() => {
      // Mimics options.js top-level binding after pairing-helpers IIFE
      const { isAllowedWorkerUrl, isValidPairingDeepLink, normalizeWorkerBase } = globalThis;
      expect(typeof isAllowedWorkerUrl).toBe('function');
      expect(typeof isValidPairingDeepLink).toBe('function');
      expect(typeof normalizeWorkerBase).toBe('function');
    }).not.toThrow();
  });
});
