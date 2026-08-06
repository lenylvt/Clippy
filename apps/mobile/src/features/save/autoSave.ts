import type { Clip } from '../../api/types';
import { fetchMyClips } from '../../api/clips';
import { mapSaveError, saveClipToPhotos } from './saveClip';
import { getSavedClipIds, isSavedClipsCorrupt, markClipSaved } from './savedClips';
import { getAutoSave } from './settings';

const inflight = new Map<string, Promise<boolean>>();
const AUTO_SAVE_CONCURRENCY = 2;

async function withClipLock(clipId: string, fn: () => Promise<boolean>): Promise<boolean> {
  const existing = inflight.get(clipId);
  if (existing) return existing;
  const run = fn().finally(() => {
    inflight.delete(clipId);
  });
  inflight.set(clipId, run);
  return run;
}

/**
 * Download + mark as saved. Used by auto-save and manual save (clip screen).
 * Idempotent per clipId via in-flight lock + persisted saved set.
 */
export async function saveOneClipIfNeeded(
  clip: Pick<Clip, 'id' | 'url'>,
  opts: { prompt?: boolean; force?: boolean } = {},
): Promise<boolean> {
  const clipId = clip.id.trim();
  if (!clipId || !clip.url?.trim()) return false;

  return withClipLock(clipId, async () => {
    if (isSavedClipsCorrupt() && !opts.force) {
      // Fail closed: avoid Photos spam until mark repairs the store.
      return false;
    }
    if (!opts.force) {
      const saved = await getSavedClipIds();
      if (saved.has(clipId)) return false;
    }
    await saveClipToPhotos(clip.url, `clippy-${clipId}.mp4`, {
      prompt: opts.prompt,
    });
    await markClipSaved(clipId);
    return true;
  });
}

/** Manual save from clip screen: always download, then mark. */
export async function saveClipManually(clip: Pick<Clip, 'id' | 'url'>): Promise<void> {
  const ok = await saveOneClipIfNeeded(clip, { force: true, prompt: true });
  if (!ok && isSavedClipsCorrupt()) {
    // force path should have repaired; if still false, surface a clear error
    throw new Error(mapSaveError('save_failed'));
  }
}

/** Auto-save a single clip from push (foreground / background task / tap). */
export async function autoSaveFromPush(opts: {
  clipId?: string;
  clipUrl?: string;
  token?: string | null;
}): Promise<void> {
  if (!(await getAutoSave())) return;
  const clipId = opts.clipId?.trim();
  let clipUrl = opts.clipUrl?.trim();
  if (!clipId) return;

  if (!clipUrl && opts.token) {
    try {
      const { clips } = await fetchMyClips(opts.token);
      clipUrl = clips.find((c) => c.id === clipId)?.url;
    } catch {
      return;
    }
  }
  if (!clipUrl) return;

  try {
    await saveOneClipIfNeeded({ id: clipId, url: clipUrl }, { prompt: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'photos_permission') return;
    /* best-effort in background */
  }
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const current = items[idx++];
      await worker(current);
    }
  });
  await Promise.all(runners);
}

/** On app open / refresh: save every unsaved clip when auto-save is on. */
export async function autoSaveAllPending(token: string): Promise<number> {
  if (!(await getAutoSave())) return 0;
  if (isSavedClipsCorrupt()) return 0;

  const { clips } = await fetchMyClips(token);
  const saved = await getSavedClipIds();
  const pending = clips.filter((c) => !saved.has(c.id));
  let count = 0;
  let permissionDenied = false;

  await mapPool(pending, AUTO_SAVE_CONCURRENCY, async (clip) => {
    if (permissionDenied) return;
    try {
      const did = await saveOneClipIfNeeded(clip, { prompt: false });
      if (did) count += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'photos_permission') {
        permissionDenied = true;
      }
    }
  });

  return count;
}
