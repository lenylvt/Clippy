import { describe, expect, it, vi } from 'vitest';
import './upload.js';

describe('uploadClip', () => {
  it('envoie le clip au worker', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        id: 'clip-1',
        url: 'https://clippy.example/clips/clip-1',
        galleryUrl: 'https://clippy.example/',
      }),
    }));
    globalThis.fetch = fetchMock;

    const blob = new Blob(['clip'], { type: 'video/webm' });
    const result = await uploadClip(
      {
        blob,
        filename: 'clip.webm',
        videoId: 'abc',
        videoTitle: 'Ma vidéo',
        youtubeUrl: 'https://www.youtube.com/watch?v=abc',
        clipStart: 10,
        clipEnd: 25,
      },
      'https://clippy.example/',
    );

    expect(result.id).toBe('clip-1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://clippy.example/api/clips',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('échoue sans URL worker', async () => {
    await expect(
      uploadClip(
        {
          blob: new Blob(['x']),
          filename: 'x.webm',
          videoId: 'a',
          videoTitle: 't',
          youtubeUrl: 'https://youtube.com/watch?v=a',
          clipStart: 0,
          clipEnd: 1,
        },
        '',
      ),
    ).rejects.toThrow('missing_worker_url');
  });
});
