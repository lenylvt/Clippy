import { describe, expect, it } from 'vitest';
import { validateUploadPayload } from './validate';

function makeFile(size: number, type = 'video/webm') {
  return new File([new Uint8Array(size)], 'clip.webm', { type });
}

describe('validateUploadPayload', () => {
  const base = {
    file: makeFile(1024),
    videoId: 'dQw4w9WgXcQ',
    videoTitle: 'Titre',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    clipStart: 0,
    clipEnd: 10,
  };

  it('accepte un payload valide', () => {
    expect(validateUploadPayload(base)).toBeNull();
  });

  it('rejette un videoId invalide', () => {
    expect(validateUploadPayload({ ...base, videoId: 'bad' })).toBe('invalid_video_id');
  });

  it('rejette une URL YouTube incohérente', () => {
    expect(
      validateUploadPayload({
        ...base,
        youtubeUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      }),
    ).toBe('invalid_youtube_url');
  });

  it('rejette un clip trop long', () => {
    expect(validateUploadPayload({ ...base, clipStart: 0, clipEnd: 400 })).toBe('clip_too_long');
  });

  it('rejette un fichier trop volumineux', () => {
    expect(validateUploadPayload({ ...base, file: makeFile(101 * 1024 * 1024) })).toBe('file_too_large');
  });

  it('rejette un titre trop long', () => {
    expect(validateUploadPayload({ ...base, videoTitle: 'x'.repeat(201) })).toBe('title_too_long');
  });
});
