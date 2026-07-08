import { describe, expect, it } from 'vitest';
import { renderGalleryBody } from './gallery/render';

describe('renderGalleryBody', () => {
  it('affiche l’état vide', () => {
    expect(renderGalleryBody([])).toContain('Aucun clip');
  });

  it('utilise l’extension du clip pour le partage', () => {
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
            extension: 'webm',
          },
        ],
      },
    ]);

    expect(html).toContain('data-share-name="clippy-clip-1.webm"');
  });
});
