import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { scopedKey, getStorageUserId } from './userScope';

const BASE_KEY = 'clippy_auto_save';
const LEGACY_SECURE_KEY = 'clippy_auto_save';

function storageKey(): string {
  return scopedKey(BASE_KEY);
}

async function migrateLegacyIfNeeded(key: string): Promise<void> {
  const existing = await AsyncStorage.getItem(key);
  if (existing != null) return;
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

/** Default: off until the user enables it. */
export async function getAutoSave(): Promise<boolean> {
  const key = storageKey();
  await migrateLegacyIfNeeded(key);
  const v = await AsyncStorage.getItem(key);
  return v === '1';
}

export async function setAutoSave(on: boolean): Promise<void> {
  await AsyncStorage.setItem(storageKey(), on ? '1' : '0');
}

export async function clearAutoSaveForCurrentUser(): Promise<void> {
  await AsyncStorage.removeItem(storageKey());
}
