import { describe, expect, it } from 'vitest';
import { renderGalleryBody } from '../src/gallery';

describe('renderGalleryBody', () => {
  it('affiche l’état vide', () => {
    expect(renderGalleryBody([])).toContain('Aucun clip');
  });

  it('nomme le partage en mp4', () => {
    const html = renderGalleryBody([
      {
        videoId: 'abc',
        videoTitle: 'Vidéo',
        youtubeUrl: 'https://www.youtube.com/watch?v=abc',
        latestAt: 1,
        clips: [
          {
            id: 'clip-1',
            videoId: 'abc',
            videoTitle: 'Vidéo',
            youtubeUrl: 'https://www.youtube.com/watch?v=abc',
            clipStart: 0,
            clipEnd: 10,
            createdAt: 1,
            expiresAt: 2,
            url: 'https://example.com/clips/clip-1',
            extension: 'mp4',
          },
        ],
      },
    ]);

    expect(html).toContain('data-share-name="clippy-clip-1.mp4"');
  });
});
