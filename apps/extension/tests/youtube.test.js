import { describe, expect, it } from 'vitest';
import '../lib/youtube.js';

describe('getYoutubeVideoId', () => {
  it('extrait v depuis une URL watch', () => {
    expect(getYoutubeVideoId('https://www.youtube.com/watch?v=DkCkIk3MkB8')).toBe('DkCkIk3MkB8');
  });

  it('extrait l’id depuis youtu.be', () => {
    expect(getYoutubeVideoId('https://youtu.be/DkCkIk3MkB8')).toBe('DkCkIk3MkB8');
  });

  it('extrait shorts / embed / live', () => {
    expect(getYoutubeVideoId('https://www.youtube.com/shorts/DkCkIk3MkB8')).toBe('DkCkIk3MkB8');
    expect(getYoutubeVideoId('https://www.youtube.com/embed/DkCkIk3MkB8')).toBe('DkCkIk3MkB8');
    expect(getYoutubeVideoId('https://www.youtube.com/live/DkCkIk3MkB8')).toBe('DkCkIk3MkB8');
  });

  it('rejette les hosts non-YouTube', () => {
    expect(getYoutubeVideoId('https://evil.com/watch?v=DkCkIk3MkB8')).toBe('');
    expect(getYoutubeVideoId('https://notyoutu.be/DkCkIk3MkB8')).toBe('');
    expect(getYoutubeVideoId('https://youtu.be.evil.com/DkCkIk3MkB8')).toBe('');
  });

  it('retourne une chaîne vide si invalide', () => {
    expect(getYoutubeVideoId('not-a-url')).toBe('');
  });
});

describe('youtubeThumbUrl', () => {
  it('construit une miniature mq', () => {
    expect(youtubeThumbUrl('DkCkIk3MkB8')).toBe('https://i.ytimg.com/vi/DkCkIk3MkB8/mqdefault.jpg');
  });

  it('rejette un id trop court', () => {
    expect(youtubeThumbUrl('abc')).toBeNull();
  });
});

describe('extractYoutubeVideoId', () => {
  it('exige 11 caractères', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=DkCkIk3MkB8')).toBe(
      'DkCkIk3MkB8',
    );
  });
});
