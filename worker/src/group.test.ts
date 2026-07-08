import { describe, expect, it } from 'vitest';
import { groupClipsByVideo } from './group';
import type { Clip } from './types';

function clip(partial: Partial<Clip> & Pick<Clip, 'id' | 'videoId' | 'createdAt'>): Clip {
  return {
    videoTitle: 'Titre',
    youtubeUrl: `https://www.youtube.com/watch?v=${partial.videoId}`,
    clipStart: 0,
    clipEnd: 10,
    expiresAt: Date.now() + 1000,
    url: `https://example.com/clips/${partial.id}`,
    extension: 'mp4',
    ...partial,
  };
}

describe('groupClipsByVideo', () => {
  it('groupe par vidéo et trie du plus récent au plus ancien', () => {
    const groups = groupClipsByVideo([
      clip({ id: 'a1', videoId: 'A', createdAt: 100, videoTitle: 'Vidéo A' }),
      clip({ id: 'b1', videoId: 'B', createdAt: 300, videoTitle: 'Vidéo B' }),
      clip({ id: 'a2', videoId: 'A', createdAt: 200, videoTitle: 'Vidéo A' }),
    ]);

    expect(groups.map((group) => group.videoId)).toEqual(['B', 'A']);
    expect(groups[1].clips.map((item) => item.id)).toEqual(['a2', 'a1']);
  });
});
