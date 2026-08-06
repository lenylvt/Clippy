import { beforeEach, describe, expect, it, vi } from 'vitest';

const photosCalls: string[] = [];
const saved = new Set<string>();

vi.mock('../src/features/save/saveClip', () => ({
  saveClipToPhotos: async (_url: string, filename: string) => {
    photosCalls.push(filename);
  },
  mapSaveError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock('../src/features/save/settings', () => ({
  getAutoSave: async () => true,
}));

vi.mock('../src/api/clips', () => ({
  fetchMyClips: async () => ({ clips: [] }),
}));

vi.mock('../src/features/save/savedClips', () => ({
  getSavedClipIds: async () => new Set(saved),
  isSavedClipsCorrupt: () => false,
  markClipSaved: async (id: string) => {
    saved.add(id);
  },
}));

describe('saveOneClipIfNeeded locks', () => {
  beforeEach(() => {
    photosCalls.length = 0;
    saved.clear();
    vi.resetModules();
  });

  it('déduplique les appels parallèles sur le même clipId', async () => {
    const { saveOneClipIfNeeded } = await import('../src/features/save/autoSave');
    const clip = { id: 'clip-1', url: 'https://cdn.example/1.mp4' };

    const results = await Promise.all([
      saveOneClipIfNeeded(clip),
      saveOneClipIfNeeded(clip),
      saveOneClipIfNeeded(clip),
    ]);

    expect(photosCalls).toHaveLength(1);
    expect(results).toEqual([true, true, true]);
    expect(saved.has('clip-1')).toBe(true);
  });

  it('force re-télécharge même si déjà marqué (save manuel)', async () => {
    saved.add('clip-1');
    const { saveClipManually } = await import('../src/features/save/autoSave');
    await saveClipManually({ id: 'clip-1', url: 'https://cdn.example/1.mp4' });
    expect(photosCalls).toHaveLength(1);
  });
});
