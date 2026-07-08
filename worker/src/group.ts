import type { Clip, VideoGroup } from './types';

export function groupClipsByVideo(clips: Clip[]): VideoGroup[] {
  const groups = new Map<string, VideoGroup>();

  for (const clip of clips) {
    const existing = groups.get(clip.videoId);
    if (existing) {
      existing.clips.push(clip);
      if (clip.createdAt > existing.latestAt) {
        existing.latestAt = clip.createdAt;
        existing.videoTitle = clip.videoTitle;
        existing.youtubeUrl = clip.youtubeUrl;
      }
    } else {
      groups.set(clip.videoId, {
        videoId: clip.videoId,
        videoTitle: clip.videoTitle,
        youtubeUrl: clip.youtubeUrl,
        latestAt: clip.createdAt,
        clips: [clip],
      });
    }
  }

  for (const group of groups.values()) {
    group.clips.sort((a, b) => b.createdAt - a.createdAt);
  }

  return [...groups.values()].sort((a, b) => b.latestAt - a.latestAt);
}
