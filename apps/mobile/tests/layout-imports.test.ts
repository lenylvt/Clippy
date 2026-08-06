import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('app/_layout background task import', () => {
  it('points at features/save/backgroundSave', () => {
    const layout = readFileSync(path.join(mobileRoot, 'app/_layout.tsx'), 'utf8');
    expect(layout).toMatch(/import ['"]\.\.\/src\/features\/save\/backgroundSave['"]/);
    expect(existsSync(path.join(mobileRoot, 'src/features/save/backgroundSave.ts'))).toBe(true);
  });

  it('n’importe plus ClipActivity / Live Activities', () => {
    const layout = readFileSync(path.join(mobileRoot, 'app/_layout.tsx'), 'utf8');
    expect(layout).not.toMatch(/ClipActivity/);
    expect(layout).not.toMatch(/liveActivity/i);
    expect(existsSync(path.join(mobileRoot, 'widgets/ClipActivity.tsx'))).toBe(false);
    expect(existsSync(path.join(mobileRoot, 'src/features/notify/liveActivity.ts'))).toBe(false);
  });
});

describe('notifications sans Live Activity', () => {
  it('n’importe pas liveActivity', () => {
    const src = readFileSync(path.join(mobileRoot, 'src/features/notify/notifications.ts'), 'utf8');
    expect(src).not.toMatch(/liveActivity/i);
    expect(src).not.toMatch(/expo-widgets/);
    expect(src).toMatch(/registerPushToken/);
  });
});

describe('app.json sans expo-widgets', () => {
  it('retire le plugin et les flags Live Activities', () => {
    const raw = readFileSync(path.join(mobileRoot, 'app.json'), 'utf8');
    expect(raw).not.toMatch(/expo-widgets/);
    expect(raw).not.toMatch(/NSSupportsLiveActivities/);
  });
});
