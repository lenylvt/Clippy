import { describe, expect, it } from 'vitest';
import '../lib/youtube.js';

describe('getYoutubeVideoId', () => {
  it('extrait v depuis une URL watch', () => {
    expect(getYoutubeVideoId('https://www.youtube.com/watch?v=DkCkIk3MkB8')).toBe('DkCkIk3MkB8');
  });

  it('extrait l’id depuis youtu.be', () => {
    expect(getYoutubeVideoId('https://youtu.be/DkCkIk3MkB8')).toBe('DkCkIk3MkB8');
  });

  it('retourne une chaîne vide si invalide', () => {
    expect(getYoutubeVideoId('not-a-url')).toBe('');
  });
});
