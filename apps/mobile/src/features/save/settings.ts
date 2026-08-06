import * as SecureStore from 'expo-secure-store';

const AUTO_SAVE_KEY = 'clippy_auto_save';

export async function getAutoSave(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(AUTO_SAVE_KEY);
  return v === '1';
}

export async function setAutoSave(on: boolean): Promise<void> {
  await SecureStore.setItemAsync(AUTO_SAVE_KEY, on ? '1' : '0');
}
