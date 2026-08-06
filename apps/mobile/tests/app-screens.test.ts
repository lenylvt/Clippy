import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(mobileRoot, 'app');

function readApp(name: string) {
  return readFileSync(path.join(appDir, name), 'utf8');
}

describe('auth gate _layout', () => {
  it('ne monte pas le stack protégé sans token', () => {
    const layout = readApp('_layout.tsx');
    expect(layout).toMatch(/if\s*\(\s*!token\s*\)/);
    expect(layout).toMatch(/Stack\.Screen name="sign-in"/);
    expect(layout).toMatch(/onOpenClip/);
  });
});

describe('home polling + jobs error', () => {
  it('fetch jobs sans active-only et poll conditionnel', () => {
    const home = readApp('index.tsx');
    expect(home).toMatch(/fetchMyJobs\(token,\s*false\)/);
    expect(home).toMatch(/filterVisibleHomeJobs/);
    expect(home).toMatch(/pendingDeletes/);
    expect(home).toMatch(/pendingJobDeletes/);
    expect(home).toMatch(/deleteJob/);
    expect(home).toMatch(/confirmDeleteJob/);
    expect(home).toMatch(/loadGen/);
    expect(home).toMatch(/router\.push\('\/activity'\)/);
    expect(home).not.toMatch(/setInterval/);
  });
});

describe('sign-in OTP', () => {
  it('expose renvoi + cooldown + validation email', () => {
    const src = readApp('sign-in.tsx');
    expect(src).toMatch(/isValidEmail/);
    expect(src).toMatch(/Renvoyer le code/);
    expect(src).toMatch(/RESEND_COOLDOWN|cooldown/);
  });
});

describe('scan lock', () => {
  it('utilise un verrou synchrone et cleanup timeout', () => {
    const src = readApp('scan.tsx');
    expect(src).toMatch(/lockRef/);
    expect(src).toMatch(/clearTimeout/);
    expect(src).toMatch(/MIN_CODE_LEN\s*=\s*6/);
  });
});

describe('settings focus + unlink confirm', () => {
  it('refetch au focus et confirme le unlink', () => {
    const src = readApp('settings.tsx');
    expect(src).toMatch(/useFocusEffect/);
    expect(src).toMatch(/confirmUnlink|Délier cette extension/);
  });
});

describe('activity poll', () => {
  it('inclut jobs error et poll séquentiel', () => {
    const src = readApp('activity.tsx');
    expect(src).toMatch(/fetchMyJobs\(token,\s*false\)/);
    expect(src).toMatch(/filterVisibleHomeJobs/);
    expect(src).toMatch(/requestId/);
    expect(src).toMatch(/pendingJobDeletes/);
    expect(src).toMatch(/deleteJob/);
    expect(src).toMatch(/DangerIconButton/);
    expect(src).not.toMatch(/Clips en préparation/);
    expect(src).not.toMatch(/footerNote/);
    expect(src).not.toMatch(/setInterval/);
  });
});

describe('clip detail', () => {
  it('gère catch, id array, optimistic delete, markClipSaved', () => {
    const src = readApp('clip/[id].tsx');
    expect(src).toMatch(/paramId/);
    expect(src).toMatch(/markClipSaved/);
    expect(src).toMatch(/\.catch\(/);
    expect(src).toMatch(/setDeleting/);
  });
});

describe('api 401 wiring', () => {
  it('enregistre un handler unauthorized', () => {
    const client = readFileSync(path.join(mobileRoot, 'src/api/client.ts'), 'utf8');
    const auth = readFileSync(path.join(mobileRoot, 'src/features/auth/auth.tsx'), 'utf8');
    expect(client).toMatch(/setOnUnauthorized/);
    expect(auth).toMatch(/setOnUnauthorized/);
    expect(auth).toMatch(/void signOut\(\)/);
    expect(existsSync(path.join(mobileRoot, 'src/lib/homeJobs.ts'))).toBe(true);
  });
});
