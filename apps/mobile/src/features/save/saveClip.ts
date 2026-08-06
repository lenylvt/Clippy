import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';

function ensureFileUri(uri: string): string {
  if (uri.startsWith('file://')) return uri;
  return `file://${uri}`;
}

export async function saveClipToPhotos(url: string, filename: string): Promise<void> {
  // writeOnly=true → NSPhotoLibraryAddUsageDescription path on iOS
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    throw new Error('photos_permission');
  }

  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new Error('no_cache');

  const safeName = filename.endsWith('.mp4') ? filename : `${filename}.mp4`;
  const path = `${dir}${safeName}`;
  const existing = await FileSystem.getInfoAsync(path);
  if (existing.exists) {
    await FileSystem.deleteAsync(path, { idempotent: true });
  }

  // Bust CDN / intermediate caches that may still hold old AV1 bytes.
  const bustUrl = url.includes('?') ? `${url}&_=${Date.now()}` : `${url}?_=${Date.now()}`;
  const download = await FileSystem.downloadAsync(bustUrl, path, {
    headers: { Accept: 'video/mp4,*/*', 'Cache-Control': 'no-cache' },
  });
  const info = await FileSystem.getInfoAsync(download.uri);
  if (!info.exists || !('size' in info) || !info.size || info.size < 1024) {
    throw new Error('download_incomplete');
  }

  const localUri = ensureFileUri(download.uri);

  try {
    await MediaLibrary.createAssetAsync(localUri);
  } catch (first) {
    try {
      await MediaLibrary.saveToLibraryAsync(localUri);
    } catch (second) {
      const msg = second instanceof Error ? second.message : String(second);
      throw new Error(msg || (first instanceof Error ? first.message : 'save_failed'));
    }
  }
}
