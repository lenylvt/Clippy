import { describe, expect, it } from 'vitest';
import type { Clip, Job } from '@clippy/shared/types';
import { groupClipsAndJobs, groupClipsByVideo } from '@clippy/shared/groupClips';

function clip(partial: Partial<Clip> & Pick<Clip, 'id' | 'videoId' | 'clipStart'>): Clip {
  return {
    videoTitle: partial.videoTitle || 'Video',
    youtubeUrl: 'https://youtu.be/x',
    clipEnd: (partial.clipStart ?? 0) + 10,
    videoDuration: partial.videoDuration ?? null,
    createdAt: partial.createdAt ?? 0,
    expiresAt: 0,
    url: `https://example.com/${partial.id}.mp4`,
    extension: 'mp4',
    ...partial,
  };
}

function job(partial: Partial<Job> & Pick<Job, 'id' | 'videoId' | 'clipStart'>): Job {
  return {
    status: 'running',
    stage: 'downloading',
    progress: 0.4,
    videoTitle: partial.videoTitle || 'Video',
    youtubeUrl: 'https://youtu.be/x',
    clipEnd: (partial.clipStart ?? 0) + 10,
    clipId: null,
    error: null,
    createdAt: partial.createdAt ?? 0,
    updatedAt: partial.createdAt ?? 0,
    ...partial,
  };
}

describe('groupClipsByVideo (mobile gallery)', () => {
  it('groups by videoId and numbers by clipStart', () => {
    const groups = groupClipsByVideo([
      clip({ id: 'c3', videoId: 'v1', clipStart: 90, createdAt: 3, videoTitle: '(1) Foo - YouTube' }),
      clip({ id: 'c1', videoId: 'v1', clipStart: 10, createdAt: 1 }),
      clip({ id: 'c2', videoId: 'v1', clipStart: 40, createdAt: 2 }),
      clip({ id: 'd1', videoId: 'v2', clipStart: 5, createdAt: 10, videoTitle: 'Bar' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]!.videoId).toBe('v2');
    expect(groups[1]!.videoId).toBe('v1');
    expect(groups[1]!.videoTitle).toBe('Foo');
    expect(groups[1]!.clips.map((c) => [c.id, c.index])).toEqual([
      ['c1', 1],
      ['c2', 2],
      ['c3', 3],
    ]);
  });

  it('ties clipStart with createdAt', () => {
    const groups = groupClipsByVideo([
      clip({ id: 'b', videoId: 'v', clipStart: 10, createdAt: 2 }),
      clip({ id: 'a', videoId: 'v', clipStart: 10, createdAt: 1 }),
    ]);
    expect(groups[0]!.clips.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('groupClipsAndJobs', () => {
  it('fusionne jobs et clips dans le même groupe vidéo', () => {
    const groups = groupClipsAndJobs(
      [clip({ id: 'c1', videoId: 'v1', clipStart: 10, createdAt: 1, videoTitle: 'Foo' })],
      [job({ id: 'j1', videoId: 'v1', clipStart: 40, createdAt: 5, progress: 0.5 })],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => [i.kind, i.index])).toEqual([
      ['clip', 1],
      ['job', 2],
    ]);
    expect(groups[0]!.jobCount).toBe(1);
    expect(groups[0]!.clipCount).toBe(1);
  });

  it('crée un groupe pour un job sans clip encore', () => {
    const groups = groupClipsAndJobs(
      [],
      [job({ id: 'j1', videoId: 'v9', clipStart: 0, createdAt: 1, videoTitle: 'Solo' })],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.videoTitle).toBe('Solo');
    expect(groups[0]!.items[0]!.kind).toBe('job');
  });

  it('ignore un job déjà matérialisé en clip', () => {
    const groups = groupClipsAndJobs(
      [clip({ id: 'c1', videoId: 'v1', clipStart: 10, createdAt: 1 })],
      [job({ id: 'j1', videoId: 'v1', clipStart: 10, createdAt: 2, clipId: 'c1' })],
    );
    expect(groups[0]!.items).toHaveLength(1);
    expect(groups[0]!.items[0]!.kind).toBe('clip');
  });
});
