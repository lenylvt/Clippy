import { describe, expect, it } from 'vitest';
import { cleanTitle, cleanYoutubeTitle } from '../src/title';
import { formatTime, parseDuration, clamp } from '../src/time';
import { extractYoutubeVideoId, getYoutubeVideoId } from '../src/youtube';
import { labelForStage, stageToQueueStatus } from '../src/stages';
import { extractPairingCode } from '../src/pairing';

describe('@clippy/shared', () => {
  it('nettoie les titres', () => {
    expect(cleanYoutubeTitle('(1) Foo - YouTube')).toBe('Foo');
    expect(cleanTitle('(1) Foo - YouTube')).toBe('Foo');
  });

  it('formate et parse le temps', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(parseDuration('1:05')).toBe(65);
    expect(clamp(5, 0, 3)).toBe(3);
  });

  it('parse les ids YouTube', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=jNQXAC9IVRw')).toBe('jNQXAC9IVRw');
    expect(getYoutubeVideoId('https://youtu.be/jNQXAC9IVRw')).toBe('jNQXAC9IVRw');
  });

  it('mappe les stages', () => {
    expect(labelForStage('done')).toBe('Terminé');
    expect(labelForStage('preparing')).toBe('Préparation…');
    expect(stageToQueueStatus('downloading')).toBe('download');
    expect(stageToQueueStatus('preparing')).toBe('preparing');
  });

  it('extrait un code de pairing', () => {
    expect(extractPairingCode('clippy://pair?code=AB12CD34')).toBe('AB12CD34');
  });
});
