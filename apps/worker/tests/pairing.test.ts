import { describe, expect, it } from 'vitest';
import { extractPairingCode } from '@clippy/shared/pairing';

describe('extractPairingCode', () => {
  it('lit clippy://pair?code=', () => {
    expect(extractPairingCode('clippy://pair?code=AB12CD34')).toBe('AB12CD34');
  });

  it('accepte un code brut', () => {
    expect(extractPairingCode('xy12zt99')).toBe('XY12ZT99');
  });

  it('rejette le bruit', () => {
    expect(extractPairingCode('hello')).toBeNull();
  });
});
