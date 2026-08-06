import { describe, expect, it } from 'vitest';
import { extractYoutubeVideoId } from '@clippy/shared/youtube';
import { validateJobPayload } from '@clippy/shared/validateJob';

describe('validateJobPayload', () => {
  it('accepte un payload valide', () => {
    expect(
      validateJobPayload({
        videoId: 'jNQXAC9IVRw',
        videoTitle: 'Me at the zoo',
        youtubeUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        clipStart: 0,
        clipEnd: 10,
      }),
    ).toBeNull();
  });

  it('rejette une durée trop courte', () => {
    expect(
      validateJobPayload({
        videoId: 'jNQXAC9IVRw',
        videoTitle: 'x',
        youtubeUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        clipStart: 0,
        clipEnd: 1,
      }),
    ).toBe('clip_too_short');
  });

  it('extrait un id shorts', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/shorts/jNQXAC9IVRw')).toBe('jNQXAC9IVRw');
  });
});
