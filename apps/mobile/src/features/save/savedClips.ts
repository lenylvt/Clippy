import * as SecureStore from 'expo-secure-store';

const SAVED_KEY = 'clippy_saved_clip_ids';

export async function getSavedClipIds(): Promise<Set<string>> {
  const raw = await SecureStore.getItemAsync(SAVED_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export async function markClipSaved(id: string): Promise<void> {
  const ids = await getSavedClipIds();
  if (ids.has(id)) return;
  ids.add(id);
  await SecureStore.setItemAsync(SAVED_KEY, JSON.stringify([...ids]));
}

export async function unmarkClipSaved(id: string): Promise<void> {
  const ids = await getSavedClipIds();
  if (!ids.delete(id)) return;
  await SecureStore.setItemAsync(SAVED_KEY, JSON.stringify([...ids]));
}
