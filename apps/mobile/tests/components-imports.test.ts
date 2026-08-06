import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { clipTimelineLayout, pct } from '../src/components/ui/clipTimelineLayout';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('JobProgressBar theme import', () => {
  it('pointe vers features/theme/theme', () => {
    const src = readFileSync(
      path.join(mobileRoot, 'src/components/ui/JobProgressBar.tsx'),
      'utf8',
    );
    expect(src).toMatch(/from ['"]\.\.\/\.\.\/features\/theme\/theme['"]/);
    expect(existsSync(path.join(mobileRoot, 'src/features/theme/theme.ts'))).toBe(true);
  });
});

describe('clipTimelineLayout', () => {
  it('calcule left/width pour un clip normal', () => {
    expect(clipTimelineLayout(10, 30, 100)).toEqual({ left: 0.1, width: 0.2 });
  });

  it('retourne width 0 si end <= start', () => {
    expect(clipTimelineLayout(20, 10, 100).width).toBe(0);
    expect(clipTimelineLayout(20, 20, 100).width).toBe(0);
  });

  it('garde les valeurs non finies', () => {
    expect(clipTimelineLayout(Number.NaN, Number.POSITIVE_INFINITY, Number.NaN)).toEqual({
      left: 0,
      width: 0,
    });
  });

  it('formate les pourcentages', () => {
    expect(pct(0.1)).toBe('10.00%');
  });
});
