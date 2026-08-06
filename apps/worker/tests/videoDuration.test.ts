import { describe, expect, it } from 'vitest';

function parseVideoDurationHeader(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

describe('X-Clippy-Video-Duration', () => {
  it('parses positive durations', () => {
    expect(parseVideoDurationHeader('612.480')).toBe(612.48);
    expect(parseVideoDurationHeader('0')).toBeNull();
    expect(parseVideoDurationHeader(null)).toBeNull();
    expect(parseVideoDurationHeader('nope')).toBeNull();
  });
});
