import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { scopedKey, getStorageUserId } from './userScope';

const BASE_KEY = 'clippy_saved_clip_ids';
/** Legacy SecureStore key (pre-AsyncStorage migration). */
const LEGACY_SECURE_KEY = 'clippy_saved_clip_ids';

let chain: Promise<unknown> = Promise.resolve();
let corrupt = false;

function withMutex<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function storageKey(): string {
  return scopedKey(BASE_KEY);
}

function parseIds(raw: string | null): Set<string> {
  if (!raw) {
    corrupt = false;
    return new Set();
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      corrupt = true;
      return new Set();
    }
    const ids = parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
    corrupt = false;
    return new Set(ids);
  } catch {
    corrupt = true;
    return new Set();
  }
}

async function migrateLegacyIfNeeded(key: string): Promise<void> {
  const existing = await AsyncStorage.getItem(key);
  if (existing != null) return;
  // Only migrate unscoped legacy key into the current user's namespace once.
  if (getStorageUserId() && key !== BASE_KEY) {
    const legacyAsync = await AsyncStorage.getItem(BASE_KEY);
    if (legacyAsync != null) {
      await AsyncStorage.setItem(key, legacyAsync);
      await AsyncStorage.removeItem(BASE_KEY);
      return;
    }
  }
  try {
    const fromSecure = await SecureStore.getItemAsync(LEGACY_SECURE_KEY);
    if (fromSecure != null) {
      await AsyncStorage.setItem(key, fromSecure);
      await SecureStore.deleteItemAsync(LEGACY_SECURE_KEY).catch(() => undefined);
    }
  } catch {
    /* SecureStore unavailable */
  }
}

async function readIds(): Promise<Set<string>> {
  const key = storageKey();
  await migrateLegacyIfNeeded(key);
  const raw = await AsyncStorage.getItem(key);
  return parseIds(raw);
}

async function writeIds(ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(storageKey(), JSON.stringify([...ids]));
  corrupt = false;
}

/** True when stored JSON was unreadable — auto-save should fail closed. */
export function isSavedClipsCorrupt(): boolean {
  return corrupt;
}

/** Returns a fresh Set (callers may mutate their copy safely). */
export async function getSavedClipIds(): Promise<Set<string>> {
  return withMutex(async () => new Set(await readIds()));
}

export async function markClipSaved(id: string): Promise<void> {
  const clipId = id.trim();
  if (!clipId) return;
  await withMutex(async () => {
    const ids = await readIds();
    if (corrupt) {
      // Repair store with this single id rather than wiping into a re-save storm.
      await writeIds(new Set([clipId]));
      return;
    }
    if (ids.has(clipId)) return;
    ids.add(clipId);
    await writeIds(ids);
  });
}

export async function unmarkClipSaved(id: string): Promise<void> {
  const clipId = id.trim();
  if (!clipId) return;
  await withMutex(async () => {
    const ids = await readIds();
    if (corrupt) {
      await writeIds(new Set());
      return;
    }
    if (!ids.delete(clipId)) return;
    await writeIds(ids);
  });
}

export async function clearSavedClipsForCurrentUser(): Promise<void> {
  await withMutex(async () => {
    await AsyncStorage.removeItem(storageKey());
    corrupt = false;
  });
}
