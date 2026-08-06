import type { Clip } from '../../api/types';
import { fetchMyClips } from '../../api/clips';
import { saveClipToPhotos } from './saveClip';
import { getSavedClipIds, markClipSaved } from './savedClips';
import { getAutoSave } from './settings';

export async function saveOneClipIfNeeded(clip: Pick<Clip, 'id' | 'url'>): Promise<boolean> {
  const saved = await getSavedClipIds();
  if (saved.has(clip.id)) return false;
  await saveClipToPhotos(clip.url, `clippy-${clip.id}.mp4`);
  await markClipSaved(clip.id);
  return true;
}

/** Auto-save a single clip from push (app background / foreground). */
export async function autoSaveFromPush(opts: {
  clipId?: string;
  clipUrl?: string;
}): Promise<void> {
  if (!(await getAutoSave())) return;
  const clipId = opts.clipId?.trim();
  const clipUrl = opts.clipUrl?.trim();
  if (!clipId || !clipUrl) return;
  try {
    await saveOneClipIfNeeded({ id: clipId, url: clipUrl });
  } catch {
    /* best-effort in background */
  }
}

/** On app open: save every unsaved clip when auto-save is on. */
export async function autoSaveAllPending(token: string): Promise<number> {
  if (!(await getAutoSave())) return 0;
  const { clips } = await fetchMyClips(token);
  const saved = await getSavedClipIds();
  let count = 0;
  for (const clip of clips) {
    if (saved.has(clip.id)) continue;
    try {
      await saveClipToPhotos(clip.url, `clippy-${clip.id}.mp4`);
      await markClipSaved(clip.id);
      saved.add(clip.id);
      count += 1;
    } catch {
      /* continue others */
    }
  }
  return count;
}
