import { describe, expect, it } from 'vitest';
import { parseBytesRange } from '../src/range';

describe('parseBytesRange', () => {
  it('parse bytes=0-1', () => {
    expect(parseBytesRange('bytes=0-1', 100)).toEqual({
      ok: true,
      offset: 0,
      length: 2,
      start: 0,
      end: 1,
    });
  });

  it('parse open end', () => {
    expect(parseBytesRange('bytes=10-', 100)).toEqual({
      ok: true,
      offset: 10,
      length: 90,
      start: 10,
      end: 99,
    });
  });

  it('parse suffix', () => {
    expect(parseBytesRange('bytes=-5', 100)).toEqual({
      ok: true,
      offset: 95,
      length: 5,
      start: 95,
      end: 99,
    });
  });

  it('rejette bytes=- (malformé)', () => {
    expect(parseBytesRange('bytes=-', 100)).toBeNull();
  });

  it('rejette multi-range', () => {
    expect(parseBytesRange('bytes=0-1,2-3', 100)).toBeNull();
  });

  it('tolère espaces autour des nombres', () => {
    expect(parseBytesRange('bytes= 0 - 1 ', 100)).toEqual({
      ok: true,
      offset: 0,
      length: 2,
      start: 0,
      end: 1,
    });
  });

  it('distingue unsatisfiable hors bornes', () => {
    expect(parseBytesRange('bytes=100-110', 100)).toEqual({
      ok: false,
      reason: 'unsatisfiable',
    });
  });

  it('retourne null si header absent ou size 0', () => {
    expect(parseBytesRange(null, 100)).toBeNull();
    expect(parseBytesRange('bytes=0-1', 0)).toBeNull();
  });
});
