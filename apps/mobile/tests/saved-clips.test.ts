import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: async (key: string) => {
      store.delete(key);
    },
  },
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));

async function loadSaved() {
  const { setStorageUserId } = await import('../src/features/save/userScope');
  const saved = await import('../src/features/save/savedClips');
  return { setStorageUserId, ...saved };
}

describe('savedClips mutex + namespace', () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
  });

  it('sérialise mark concurrent sans perdre d’IDs', async () => {
    const { setStorageUserId, markClipSaved, getSavedClipIds } = await loadSaved();
    setStorageUserId('user-a');

    await Promise.all([
      markClipSaved('a'),
      markClipSaved('b'),
      markClipSaved('c'),
      markClipSaved('a'),
    ]);

    const ids = await getSavedClipIds();
    expect([...ids].sort()).toEqual(['a', 'b', 'c']);
    expect(store.get('clippy_saved_clip_ids:user-a')).toBeTruthy();
  });

  it('filtre les non-strings et namespace par user', async () => {
    const { setStorageUserId, getSavedClipIds } = await loadSaved();
    setStorageUserId('u1');
    store.clear();
    store.set('clippy_saved_clip_ids:u1', JSON.stringify(['ok', 12, null, 'two']));

    const ids = await getSavedClipIds();
    expect([...ids].sort()).toEqual(['ok', 'two']);

    setStorageUserId('u2');
    expect([...(await getSavedClipIds())]).toEqual([]);
  });

  it('clear au scope user', async () => {
    const { setStorageUserId, markClipSaved, clearSavedClipsForCurrentUser, getSavedClipIds } =
      await loadSaved();
    setStorageUserId('u1');
    await markClipSaved('x');
    await clearSavedClipsForCurrentUser();
    expect([...(await getSavedClipIds())]).toEqual([]);
  });
});
