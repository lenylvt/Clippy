import { describe, expect, it } from 'vitest';
import { parseBytesRange } from '../src/range';

describe('parseBytesRange', () => {
  it('parse bytes=0-1', () => {
    expect(parseBytesRange('bytes=0-1', 100)).toEqual({
      offset: 0,
      length: 2,
      start: 0,
      end: 1,
    });
  });

  it('parse open end', () => {
    expect(parseBytesRange('bytes=10-', 100)).toEqual({
      offset: 10,
      length: 90,
      start: 10,
      end: 99,
    });
  });

  it('parse suffix', () => {
    expect(parseBytesRange('bytes=-5', 100)).toEqual({
      offset: 95,
      length: 5,
      start: 95,
      end: 99,
    });
  });

  it('rejette hors bornes', () => {
    expect(parseBytesRange('bytes=100-110', 100)).toBeNull();
  });
});
