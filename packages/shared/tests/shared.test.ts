import { describe, expect, it } from 'vitest';
import { cleanTitle, cleanYoutubeTitle } from '../src/title';
import {
  clamp,
  clipDuration,
  deleteButtonLabel,
  formatAutoRemaining,
  formatRange,
  formatTime,
  isTimeInClip,
  normalizeClip,
  parseDuration,
  timelineSpan,
} from '../src/time';
import {
  extractYoutubeVideoId,
  getYoutubeVideoId,
  isValidYoutubeVideoId,
  youtubeThumbUrl,
} from '../src/youtube';
import {
  isJobStage,
  labelForStage,
  queueBarWidth,
  stageToQueueStatus,
} from '../src/stages';
import { extractPairingCode } from '../src/pairing';
import { validateJobPayload } from '../src/validateJob';
import { groupClipsAndJobs, groupClipsByVideo } from '../src/groupClips';
import type { Clip, Job } from '../src/types';

describe('youtube', () => {
  it('extrait watch / shorts / embed / live / v / youtu.be', () => {
    const id = 'jNQXAC9IVRw';
    expect(extractYoutubeVideoId(`https://www.youtube.com/watch?v=${id}`)).toBe(id);
    expect(extractYoutubeVideoId(`https://youtube.com/shorts/${id}`)).toBe(id);
    expect(extractYoutubeVideoId(`https://www.youtube.com/embed/${id}`)).toBe(id);
    expect(extractYoutubeVideoId(`https://www.youtube.com/live/${id}`)).toBe(id);
    expect(extractYoutubeVideoId(`https://www.youtube.com/v/${id}`)).toBe(id);
    expect(extractYoutubeVideoId(`https://youtu.be/${id}`)).toBe(id);
    expect(extractYoutubeVideoId(`https://m.youtube.com/watch?v=${id}`)).toBe(id);
    expect(extractYoutubeVideoId(`https://music.youtube.com/watch?v=${id}`)).toBe(id);
    expect(extractYoutubeVideoId(`https://www.youtube-nocookie.com/embed/${id}`)).toBe(id);
  });

  it('rejette les hôtes spoof (pas includes youtu.be)', () => {
    expect(extractYoutubeVideoId('https://notyoutu.be/jNQXAC9IVRw')).toBeNull();
    expect(extractYoutubeVideoId('https://evil.com/watch?v=jNQXAC9IVRw')).toBeNull();
    expect(extractYoutubeVideoId('https://evil.com/shorts/jNQXAC9IVRw')).toBeNull();
    expect(extractYoutubeVideoId('https://youtube.com.evil.com/watch?v=jNQXAC9IVRw')).toBeNull();
  });

  it('aligne getYoutubeVideoId sur shorts/embed/live', () => {
    const id = 'jNQXAC9IVRw';
    expect(getYoutubeVideoId(`https://www.youtube.com/shorts/${id}`)).toBe(id);
    expect(getYoutubeVideoId(`https://www.youtube.com/embed/${id}`)).toBe(id);
    expect(getYoutubeVideoId(`https://www.youtube.com/live/${id}`)).toBe(id);
    expect(getYoutubeVideoId(`https://youtu.be/${id}`)).toBe(id);
    expect(getYoutubeVideoId('https://evil.com/watch?v=jNQXAC9IVRw')).toBe('');
  });

  it('accepte les URLs sans schéma et youtu.be&t=', () => {
    expect(extractYoutubeVideoId('www.youtube.com/watch?v=jNQXAC9IVRw')).toBe('jNQXAC9IVRw');
    expect(extractYoutubeVideoId('https://youtu.be/jNQXAC9IVRw&t=10')).toBe('jNQXAC9IVRw');
  });

  it('thumb uniquement pour ids valides', () => {
    expect(youtubeThumbUrl('dQw4w9WgXcQ')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    );
    expect(youtubeThumbUrl('abcdef')).toBeNull();
    expect(isValidYoutubeVideoId('jNQXAC9IVRw')).toBe(true);
  });
});

describe('validateJobPayload', () => {
  const base = {
    videoId: 'jNQXAC9IVRw',
    videoTitle: 'Me at the zoo',
    youtubeUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    clipStart: 0,
    clipEnd: 10,
  };

  it('accepte un payload valide', () => {
    expect(validateJobPayload(base)).toBeNull();
  });

  it('rejette clipStart < 0', () => {
    expect(validateJobPayload({ ...base, clipStart: -5, clipEnd: 5 })).toBe('invalid_range');
  });

  it('trim le titre avant longueur / empty', () => {
    expect(validateJobPayload({ ...base, videoTitle: '   ' })).toBe('invalid_title');
    expect(validateJobPayload({ ...base, videoTitle: `${'x'.repeat(200)} ` })).toBeNull();
    expect(validateJobPayload({ ...base, videoTitle: `${'x'.repeat(201)}` })).toBe('title_too_long');
  });

  it('garde les types runtime', () => {
    expect(
      validateJobPayload({ ...base, videoTitle: 123 as unknown as string }),
    ).toBe('invalid_title');
    expect(
      validateJobPayload({ ...base, youtubeUrl: null as unknown as string }),
    ).toBe('invalid_youtube_url');
  });
});

describe('time', () => {
  it('formatTime garde Infinity / NaN', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(-3)).toBe('0:00');
  });

  it('normalizeClip gère duration <= 0 et inversion', () => {
    expect(normalizeClip(1, 5, 0)).toEqual({ start: 0, end: 0 });
    expect(normalizeClip(1, 5, -5)).toEqual({ start: 0, end: 0 });
    expect(normalizeClip(100, 50, 200)).toEqual({ start: 50, end: 100 });
    expect(normalizeClip(0, 10, 2)).toEqual({ start: 0, end: 2 });
    expect(normalizeClip(Number.NaN, 10, 100)).toEqual({ start: 0, end: 10 });
    expect(normalizeClip(0, Number.NaN, 100)).toEqual({ start: 0, end: 0 });
  });

  it('parseDuration strict + clamp min/max swap', () => {
    expect(parseDuration('1:05')).toBe(65);
    expect(parseDuration('1e2')).toBeNull();
    expect(parseDuration('+1:00')).toBeNull();
    expect(parseDuration('1:30.5')).toBeNull();
    expect(clamp(1, 5, 3)).toBe(3);
    expect(clamp(NaN, 0, 1)).toBe(0);
    expect(clamp(Infinity, 0, 1)).toBe(1);
  });

  it('formatAutoRemaining / clipDuration / timelineSpan', () => {
    const now = 1_000_000;
    expect(formatAutoRemaining(now - 1000, now)).toBe('0 min');
    expect(deleteButtonLabel(now - 1000, now)).toBe('Supprimer (Auto: 0 min)');
    expect(clipDuration(NaN, 10)).toBe(0);
    expect(timelineSpan([])).toBe(1);
    expect(timelineSpan([], 0)).toBe(0);
    expect(timelineSpan([{ clipEnd: 40, videoDuration: NaN }])).toBe(40);
    expect(formatRange(10, 45)).toBe('0:10 – 0:45');
    expect(isTimeInClip(90, 10, 90)).toBe(true);
  });
});

describe('pairing', () => {
  it('uppercase + null si vide / invalide', () => {
    expect(extractPairingCode('clippy://pair?code=ab12cd34')).toBe('AB12CD34');
    expect(extractPairingCode('clippy://pair?code=')).toBeNull();
    expect(extractPairingCode('clippy://pair')).toBeNull();
    expect(extractPairingCode('clippy://pair?code=%20AB12CD34')).toBe('AB12CD34');
    expect(extractPairingCode('xy12zt99')).toBe('XY12ZT99');
    expect(extractPairingCode('hello')).toBeNull();
    expect(extractPairingCode('code=AB12CD34 in free text')).toBeNull();
  });
});

describe('title', () => {
  it('cleanTitle fallback Sans titre, pas le titre sale', () => {
    expect(cleanYoutubeTitle('(1) Foo - YouTube')).toBe('Foo');
    expect(cleanTitle('(1) Foo - YouTube')).toBe('Foo');
    expect(cleanTitle('(1) - YouTube')).toBe('Sans titre');
    expect(cleanTitle('')).toBe('Sans titre');
    expect(cleanTitle('x ｜ YouTube')).toBe('x');
  });
});

describe('stages', () => {
  it('unknown handling + labels', () => {
    expect(labelForStage('done')).toBe('Terminé');
    expect(labelForStage('nope')).toBe('En cours…');
    expect(stageToQueueStatus('downloading')).toBe('download');
    expect(stageToQueueStatus('weird')).toBe('unknown');
    expect(isJobStage('preparing')).toBe(true);
    expect(isJobStage('nope')).toBe(false);
  });

  it('queueBarWidth types dock + clamp', () => {
    expect(queueBarWidth('download', 0.42)).toBe(42);
    expect(queueBarWidth('done', 1)).toBe(100);
    expect(queueBarWidth('error', 0.2)).toBe(100);
    expect(queueBarWidth('queued', 0)).toBe(4);
    expect(queueBarWidth('preparing', 0)).toBe(8);
    expect(queueBarWidth('unknown', 0)).toBe(8);
    expect(queueBarWidth('download', Infinity)).toBe(100);
  });
});

describe('groupClips', () => {
  function clip(partial: Partial<Clip> & Pick<Clip, 'id' | 'videoId' | 'clipStart'>): Clip {
    return {
      videoTitle: partial.videoTitle || 'Video',
      youtubeUrl: 'https://youtu.be/x',
      clipEnd: (partial.clipStart ?? 0) + 10,
      videoDuration: partial.videoDuration ?? null,
      createdAt: partial.createdAt ?? 0,
      expiresAt: 0,
      url: `https://example.com/${partial.id}.mp4`,
      extension: 'mp4',
      ...partial,
    };
  }

  function job(partial: Partial<Job> & Pick<Job, 'id' | 'videoId' | 'clipStart'>): Job {
    return {
      status: 'running',
      stage: 'downloading',
      progress: 0.4,
      videoTitle: partial.videoTitle || 'Video',
      youtubeUrl: 'https://youtu.be/x',
      clipEnd: (partial.clipStart ?? 0) + 10,
      clipId: null,
      error: null,
      createdAt: partial.createdAt ?? 0,
      updatedAt: partial.createdAt ?? 0,
      ...partial,
    };
  }

  it('préfère le titre clip et inclut jobs en échec', () => {
    const groups = groupClipsAndJobs(
      [clip({ id: 'c1', videoId: 'v1', clipStart: 0, createdAt: 1, videoTitle: '(1) Good - YouTube' })],
      [
        job({
          id: 'j1',
          videoId: 'v1',
          clipStart: 20,
          createdAt: 99,
          videoTitle: '(1) Bad - YouTube',
          status: 'error',
          stage: 'error',
        }),
        job({ id: 'j2', videoId: 'v1', clipStart: 40, createdAt: 2 }),
      ],
    );
    expect(groups[0]!.videoTitle).toBe('Good');
    expect(groups[0]!.jobCount).toBe(2);
    expect(groups[0]!.items.some((i) => i.kind === 'job' && i.job.id === 'j1')).toBe(true);
    expect(groups[0]!.items.some((i) => i.kind === 'job' && i.job.id === 'j2')).toBe(true);
  });

  it('ignore jobs done', () => {
    const groups = groupClipsAndJobs(
      [],
      [
        job({
          id: 'j1',
          videoId: 'v1',
          clipStart: 0,
          status: 'done',
          stage: 'done',
        }),
      ],
    );
    expect(groups).toHaveLength(0);
  });

  it('bucket unknown si videoId vide + titre sale → Sans titre', () => {
    const groups = groupClipsByVideo([
      clip({ id: 'c1', videoId: '  ', clipStart: 0, videoTitle: '(1) - YouTube' }),
    ]);
    expect(groups[0]!.videoId).toBe('unknown');
    expect(groups[0]!.videoTitle).toBe('Sans titre');
  });
});
