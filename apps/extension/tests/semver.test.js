import { describe, expect, it } from 'vitest';
import '../lib/semver.js';

describe('semver', () => {
  it('compare les versions majeures/mineures/patch', () => {
    expect(globalThis.compareSemver('0.2.5', '0.2.6')).toBeLessThan(0);
    expect(globalThis.compareSemver('0.2.6', '0.2.6')).toBe(0);
    expect(globalThis.compareSemver('0.3.0', '0.2.9')).toBeGreaterThan(0);
  });

  it('détecte une version distante plus récente', () => {
    expect(globalThis.isRemoteNewer('0.2.5', '0.2.6')).toBe(true);
    expect(globalThis.isRemoteNewer('0.2.6', '0.2.6')).toBe(false);
    expect(globalThis.isRemoteNewer('0.2.7', '0.2.6')).toBe(false);
  });
});
