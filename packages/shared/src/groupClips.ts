import { cleanTitle } from './title';
import type { Clip, Job } from './types';

export type NumberedClip = Clip & { index: number };

export type VideoGroup = {
  videoId: string;
  videoTitle: string;
  videoDuration: number | null;
  clips: NumberedClip[];
};

export type HomeClipItem = {
  kind: 'clip';
  index: number;
  clip: Clip;
};

export type HomeJobItem = {
  kind: 'job';
  index: number;
  job: Job;
};

export type HomeItem = HomeClipItem | HomeJobItem;

export type HomeVideoGroup = {
  videoId: string;
  videoTitle: string;
  videoDuration: number | null;
  items: HomeItem[];
  clipCount: number;
  jobCount: number;
};

/** Group by video, number 1..n by clipStart (earliest in video = 1). */
export function groupClipsByVideo(clips: Clip[]): VideoGroup[] {
  return groupClipsAndJobs(clips, []).map((g) => ({
    videoId: g.videoId,
    videoTitle: g.videoTitle,
    videoDuration: g.videoDuration,
    clips: g.items
      .filter((i): i is HomeClipItem => i.kind === 'clip')
      .map((i) => ({ ...i.clip, index: i.index })),
  }));
}

/**
 * Merge ready clips + in-progress jobs into the same video groups.
 * Jobs that already produced a known clipId are skipped to avoid duplicates.
 */
export function groupClipsAndJobs(clips: Clip[], jobs: Job[]): HomeVideoGroup[] {
  const clipIds = new Set(clips.map((c) => c.id));
  const pendingJobs = jobs.filter((j) => !j.clipId || !clipIds.has(j.clipId));

  type Entry =
    | { kind: 'clip'; videoId: string; clipStart: number; createdAt: number; clip: Clip }
    | { kind: 'job'; videoId: string; clipStart: number; createdAt: number; job: Job };

  const entries: Entry[] = [
    ...clips.map((clip) => ({
      kind: 'clip' as const,
      videoId: clip.videoId || clip.id,
      clipStart: clip.clipStart,
      createdAt: clip.createdAt,
      clip,
    })),
    ...pendingJobs.map((job) => ({
      kind: 'job' as const,
      videoId: job.videoId || job.id,
      clipStart: job.clipStart,
      createdAt: job.createdAt,
      job,
    })),
  ];

  const byVideo = new Map<string, Entry[]>();
  for (const entry of entries) {
    const list = byVideo.get(entry.videoId) ?? [];
    list.push(entry);
    byVideo.set(entry.videoId, list);
  }

  const groups: HomeVideoGroup[] = [];
  for (const [videoId, list] of byVideo) {
    const sorted = [...list].sort((a, b) => {
      if (a.clipStart !== b.clipStart) return a.clipStart - b.clipStart;
      return a.createdAt - b.createdAt;
    });

    const titleSource = [...list].sort((a, b) => b.createdAt - a.createdAt)[0];
    const rawTitle =
      titleSource?.kind === 'clip'
        ? titleSource.clip.videoTitle
        : titleSource?.kind === 'job'
          ? titleSource.job.videoTitle
          : 'Sans titre';

    const durations = list.flatMap((e) => {
      if (e.kind === 'clip' && e.clip.videoDuration != null && e.clip.videoDuration > 0) {
        return [e.clip.videoDuration];
      }
      return [];
    });
    const videoDuration = durations.length ? Math.max(...durations) : null;

    const items: HomeItem[] = sorted.map((entry, i) => {
      const index = i + 1;
      if (entry.kind === 'clip') return { kind: 'clip', index, clip: entry.clip };
      return { kind: 'job', index, job: entry.job };
    });

    groups.push({
      videoId,
      videoTitle: cleanTitle(rawTitle || 'Sans titre'),
      videoDuration,
      items,
      clipCount: items.filter((i) => i.kind === 'clip').length,
      jobCount: items.filter((i) => i.kind === 'job').length,
    });
  }

  groups.sort((a, b) => {
    const aMax = Math.max(
      ...a.items.map((i) => (i.kind === 'clip' ? i.clip.createdAt : i.job.createdAt)),
    );
    const bMax = Math.max(
      ...b.items.map((i) => (i.kind === 'clip' ? i.clip.createdAt : i.job.createdAt)),
    );
    return bMax - aMax;
  });

  return groups;
}
