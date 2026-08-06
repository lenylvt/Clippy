import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';

function ensureFileUri(uri: string): string {
  if (uri.startsWith('file://')) return uri;
  return `file://${uri}`;
}

const ERROR_FR: Record<string, string> = {
  photos_permission: 'Autorisation Photos refusée',
  no_cache: 'Stockage local indisponible',
  download_incomplete: 'Téléchargement incomplet',
  save_failed: 'Enregistrement dans Photos impossible',
};

export function mapSaveError(err: unknown): string {
  const code = err instanceof Error ? err.message : String(err);
  return ERROR_FR[code] ?? (code || ERROR_FR.save_failed);
}

export type SaveClipOptions = {
  /** When false, never show the permission prompt (background). Default true. */
  prompt?: boolean;
  /** Skip CDN cache-bust query (reuse URL as-is). */
  bustCache?: boolean;
};

export async function saveClipToPhotos(
  url: string,
  filename: string,
  opts: SaveClipOptions = {},
): Promise<void> {
  const prompt = opts.prompt !== false;
  const bustCache = opts.bustCache !== false;

  const existingPerm = await MediaLibrary.getPermissionsAsync(true);
  let permission = existingPerm;
  if (!existingPerm.granted) {
    if (!prompt) {
      throw new Error('photos_permission');
    }
    permission = await MediaLibrary.requestPermissionsAsync(true);
  }
  if (!permission.granted) {
    throw new Error('photos_permission');
  }

  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new Error('no_cache');

  const base = filename.endsWith('.mp4') ? filename.slice(0, -4) : filename;
  const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, '_') || 'clippy';
  const path = `${dir}${safeBase}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;

  let localUri: string | null = null;
  try {
    const downloadUrl = bustCache
      ? url.includes('?')
        ? `${url}&_=${Date.now()}`
        : `${url}?_=${Date.now()}`
      : url;

    const download = await FileSystem.downloadAsync(downloadUrl, path, {
      headers: { Accept: 'video/mp4,*/*', 'Cache-Control': 'no-cache' },
    });
    const info = await FileSystem.getInfoAsync(download.uri);
    if (!info.exists || !('size' in info) || !info.size || info.size < 1024) {
      throw new Error('download_incomplete');
    }

    localUri = ensureFileUri(download.uri);

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
  } finally {
    await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
  }
}
