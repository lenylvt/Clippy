import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('home job rows', () => {
  it('fusionne clips et jobs dans les groupes vidéo', () => {
    const home = readFileSync(path.join(mobileRoot, 'app/index.tsx'), 'utf8');
    expect(home).toMatch(/groupClipsAndJobs/);
    expect(home).toMatch(/JobProgressBar/);
    expect(home).not.toMatch(/JobQueueRow/);
    expect(existsSync(path.join(mobileRoot, 'src/components/JobQueueRow.tsx'))).toBe(false);
  });

  it('activity utilise la même UI groupée', () => {
    const activity = readFileSync(path.join(mobileRoot, 'app/activity.tsx'), 'utf8');
    expect(activity).toMatch(/groupClipsAndJobs/);
    expect(activity).toMatch(/JobProgressBar/);
    expect(activity).not.toMatch(/JobQueueRow/);
  });
});
