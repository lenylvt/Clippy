import { cleanTitle } from './title';
import type { Clip, Job, JobStatus } from './types';

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

const ACTIVE_JOB_STATUSES: ReadonlySet<JobStatus> = new Set(['queued', 'running']);

/** Group by video, number 1..n by clipStart (earliest in video = 1). */
export function groupClipsByVideo(clips: Clip[]): VideoGroup[] {
  return groupClipsAndJobs(clips, []).map((g) => {
    const onlyClips = g.items.filter((i): i is HomeClipItem => i.kind === 'clip');
    return {
      videoId: g.videoId,
      videoTitle: g.videoTitle,
      videoDuration: g.videoDuration,
      clips: onlyClips.map((i, idx) => ({ ...i.clip, index: idx + 1 })),
    };
  });
}

/**
 * Merge ready clips + in-progress / failed jobs into the same video groups.
 * Skips `done` jobs and jobs whose `clipId` already exists as a ready clip.
 */
export function groupClipsAndJobs(clips: Clip[], jobs: Job[]): HomeVideoGroup[] {
  const clipIds = new Set(clips.map((c) => c.id));
  const pendingJobs = jobs.filter((j) => {
    if (j.status === 'done' || j.stage === 'done') return false;
    if (j.clipId && clipIds.has(j.clipId)) return false;
    // queued / running / error (and matching stages)
    return (
      ACTIVE_JOB_STATUSES.has(j.status) ||
      j.status === 'error' ||
      j.stage === 'error'
    );
  });

  type Entry =
    | { kind: 'clip'; videoId: string; clipStart: number; createdAt: number; id: string; clip: Clip }
    | { kind: 'job'; videoId: string; clipStart: number; createdAt: number; id: string; job: Job };

  const entries: Entry[] = [
    ...clips.map((clip) => ({
      kind: 'clip' as const,
      videoId: clip.videoId.trim() || 'unknown',
      clipStart: clip.clipStart,
      createdAt: clip.createdAt,
      id: clip.id,
      clip,
    })),
    ...pendingJobs.map((job) => ({
      kind: 'job' as const,
      videoId: job.videoId.trim() || 'unknown',
      clipStart: job.clipStart,
      createdAt: job.createdAt,
      id: job.id,
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
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.id.localeCompare(b.id);
    });

    // Prefer newest clip title; fall back to newest job title.
    const clipsNewest = [...list]
      .filter((e): e is Extract<Entry, { kind: 'clip' }> => e.kind === 'clip')
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    const jobsNewest = [...list]
      .filter((e): e is Extract<Entry, { kind: 'job' }> => e.kind === 'job')
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    const rawTitle = clipsNewest?.clip.videoTitle ?? jobsNewest?.job.videoTitle ?? 'Sans titre';

    const durations = list.flatMap((e) => {
      if (e.kind === 'clip' && e.clip.videoDuration != null && e.clip.videoDuration > 0) {
        return [e.clip.videoDuration];
      }
      return [];
    });
    const videoDuration = durations.length ? Math.max(...durations) : null;

    let clipCount = 0;
    let jobCount = 0;
    const items: HomeItem[] = sorted.map((entry, i) => {
      const index = i + 1;
      if (entry.kind === 'clip') {
        clipCount += 1;
        return { kind: 'clip', index, clip: entry.clip };
      }
      jobCount += 1;
      return { kind: 'job', index, job: entry.job };
    });

    groups.push({
      videoId,
      videoTitle: cleanTitle(rawTitle),
      videoDuration,
      items,
      clipCount,
      jobCount,
    });
  }

  groups.sort((a, b) => {
    if (a.items.length === 0 && b.items.length === 0) return 0;
    if (a.items.length === 0) return 1;
    if (b.items.length === 0) return -1;
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
