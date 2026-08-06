import { describe, expect, it } from 'vitest';
import { clipDuration, deleteButtonLabel, formatRange, formatTime, timelineSpan } from '@clippy/shared/time';
import { youtubeThumbUrl } from '@clippy/shared/youtube';

describe('formatTime', () => {
  it('formats mm:ss and hh:mm:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3661)).toBe('1:01:01');
  });
});

describe('formatRange / clipDuration / timelineSpan', () => {
  it('builds readable range and duration', () => {
    expect(formatRange(10, 45)).toBe('0:10 – 0:45');
    expect(clipDuration(10, 45)).toBe(35);
    expect(clipDuration(50, 40)).toBe(0);
  });

  it('prefers probed videoDuration for timeline span', () => {
    expect(
      timelineSpan([
        { clipEnd: 40, videoDuration: 600 },
        { clipEnd: 90, videoDuration: null },
      ]),
    ).toBe(600);
    expect(timelineSpan([{ clipEnd: 40 }, { clipEnd: 90 }])).toBe(90);
  });
});

describe('formatAutoRemaining / deleteButtonLabel', () => {
  it('shows hours remaining until auto-delete', () => {
    const now = 1_000_000;
    expect(deleteButtonLabel(now + 47 * 3_600_000, now)).toBe('Supprimer (Auto: 47h)');
    expect(deleteButtonLabel(now + 30 * 60_000, now)).toBe('Supprimer (Auto: 30 min)');
    expect(deleteButtonLabel(now - 1000, now)).toBe('Supprimer (Auto: 0 min)');
  });
});

describe('youtubeThumbUrl', () => {
  it('builds mq/hq urls and rejects empty ids', () => {
    expect(youtubeThumbUrl('dQw4w9WgXcQ')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    );
    expect(youtubeThumbUrl('dQw4w9WgXcQ', 'hq')).toContain('hqdefault');
    expect(youtubeThumbUrl('')).toBeNull();
    expect(youtubeThumbUrl('ab')).toBeNull();
  });
});
