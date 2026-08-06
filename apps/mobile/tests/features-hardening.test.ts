import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('features hardening', () => {
  it('backgroundSave parse dataString + BackgroundNotificationResult', () => {
    const src = readFileSync(path.join(mobileRoot, 'src/features/save/backgroundSave.ts'), 'utf8');
    expect(src).toMatch(/extractPushDataFromTaskPayload/);
    expect(src).toMatch(/BackgroundNotification(?:Task)?Result/);
    expect(src).toMatch(/NewData/);
    expect(src).toMatch(/NoData/);
    expect(src).toMatch(/Failed/);
  });

  it('savedClips utilise AsyncStorage + mutex', () => {
    const src = readFileSync(path.join(mobileRoot, 'src/features/save/savedClips.ts'), 'utf8');
    expect(src).toMatch(/async-storage/);
    expect(src).toMatch(/withMutex/);
    expect(src).not.toMatch(/SecureStore\.setItemAsync/);
  });

  it('auth ne wipe le token que sur 401', () => {
    const src = readFileSync(path.join(mobileRoot, 'src/features/auth/auth.tsx'), 'utf8');
    expect(src).toMatch(/isUnauthorized/);
    expect(src).toMatch(/AFTER_FIRST_UNLOCK/);
    expect(src).toMatch(/clearSavedClipsForCurrentUser/);
  });

  it('notifications lit getLastNotificationResponse au cold start', () => {
    const src = readFileSync(path.join(mobileRoot, 'src/features/notify/notifications.ts'), 'utf8');
    expect(src).toMatch(/getLastNotificationResponse/);
    expect(src).toMatch(/projectId/);
  });

  it('saveClip cleanup cache + getPermissions avant prompt', () => {
    const src = readFileSync(path.join(mobileRoot, 'src/features/save/saveClip.ts'), 'utf8');
    expect(src).toMatch(/getPermissionsAsync/);
    expect(src).toMatch(/deleteAsync/);
    expect(src).toMatch(/finally/);
  });

  it('clip screen marque après save manuel', () => {
    const src = readFileSync(path.join(mobileRoot, 'app/clip/[id].tsx'), 'utf8');
    expect(src).toMatch(/saveClipManually/);
  });

  it('theme useMemo', () => {
    const src = readFileSync(path.join(mobileRoot, 'src/features/theme/theme.ts'), 'utf8');
    expect(src).toMatch(/useMemo/);
  });
});
