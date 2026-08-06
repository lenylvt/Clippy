import { describe, expect, it } from 'vitest';
import { isValidEmail } from '../src/lib/email';
import { apiMessageFr } from '../src/lib/apiMessages';
import { filterVisibleHomeJobs, hasBusyJobs, isVisibleHomeJob } from '../src/lib/homeJobs';
import { paramId } from '../src/lib/paramId';
import type { Job } from '../src/api/types';

function job(partial: Partial<Job> & Pick<Job, 'id' | 'status' | 'stage'>): Job {
  return {
    progress: 0,
    videoId: 'v',
    videoTitle: 't',
    youtubeUrl: 'https://youtube.com/watch?v=v',
    clipStart: 0,
    clipEnd: 10,
    clipId: null,
    error: null,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

describe('isValidEmail', () => {
  it('accepte un e-mail simple', () => {
    expect(isValidEmail('toi@exemple.com')).toBe(true);
  });

  it('refuse sans @ ou domaine', () => {
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('pas-un-mail')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('apiMessageFr', () => {
  it('mappe les codes connus', () => {
    expect(apiMessageFr('http_429')).toMatch(/tentatives/i);
    expect(apiMessageFr('photos_permission')).toMatch(/Photos/i);
  });

  it('garde un message déjà lisible', () => {
    expect(apiMessageFr('Code incorrect')).toBe('Code incorrect');
  });
});

describe('homeJobs', () => {
  it('inclut queued/running et error, exclut done', () => {
    const jobs = [
      job({ id: '1', status: 'queued', stage: 'downloading' }),
      job({ id: '2', status: 'running', stage: 'cropping' }),
      job({ id: '3', status: 'error', stage: 'error', error: 'boom' }),
      job({ id: '4', status: 'done', stage: 'done', clipId: 'c1' }),
    ];
    const visible = filterVisibleHomeJobs(jobs);
    expect(visible.map((j) => j.id)).toEqual(['1', '2', '3']);
    expect(isVisibleHomeJob(jobs[3]!)).toBe(false);
    expect(hasBusyJobs(visible)).toBe(true);
    expect(hasBusyJobs([jobs[3]!])).toBe(false);
  });
});

describe('paramId', () => {
  it('normalise string | string[]', () => {
    expect(paramId('abc')).toBe('abc');
    expect(paramId(['abc', 'def'])).toBe('abc');
    expect(paramId(undefined)).toBe(null);
    expect(paramId('  ')).toBe(null);
  });
});
