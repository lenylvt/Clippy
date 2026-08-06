import { describe, expect, it } from 'vitest';
import {
  extractPushDataFromTaskPayload,
  normalizePushData,
  readJobDonePayload,
} from '../src/features/notify/pushPayload';

describe('normalizePushData', () => {
  it('accepte un objet', () => {
    expect(normalizePushData({ type: 'job_done', clipId: 'a' })).toEqual({
      type: 'job_done',
      clipId: 'a',
    });
  });

  it('parse une string JSON', () => {
    expect(normalizePushData('{"type":"job_done","clipId":"x"}')).toEqual({
      type: 'job_done',
      clipId: 'x',
    });
  });

  it('ignore JSON invalide', () => {
    expect(normalizePushData('{nope')).toBeUndefined();
    expect(normalizePushData(null)).toBeUndefined();
    expect(normalizePushData([1, 2])).toBeUndefined();
  });
});

describe('extractPushDataFromTaskPayload', () => {
  it('parse dataString (headless / background)', () => {
    const data = extractPushDataFromTaskPayload({
      notification: null,
      data: {
        dataString: JSON.stringify({
          type: 'job_done',
          clipId: 'c1',
          clipUrl: 'https://cdn.example/c1.mp4',
        }),
      },
    });
    expect(data).toEqual({
      type: 'job_done',
      clipId: 'c1',
      clipUrl: 'https://cdn.example/c1.mp4',
    });
    expect(readJobDonePayload(data)?.clipId).toBe('c1');
  });

  it('fallback sur champs plats dans data', () => {
    const data = extractPushDataFromTaskPayload({
      notification: null,
      data: { type: 'job_done', clipId: 'c2', clipUrl: 'https://x/y.mp4' },
    });
    expect(readJobDonePayload(data)).toEqual({
      clipId: 'c2',
      clipUrl: 'https://x/y.mp4',
    });
  });

  it('branche NotificationResponse (actionIdentifier)', () => {
    const data = extractPushDataFromTaskPayload({
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      notification: {
        request: {
          content: {
            data: { type: 'job_done', clipId: 'tap1', clipUrl: 'https://x/t.mp4' },
          },
        },
      },
    });
    expect(readJobDonePayload(data)?.clipId).toBe('tap1');
  });

  it('ignore les payloads non job_done', () => {
    const data = extractPushDataFromTaskPayload({
      data: { dataString: '{"type":"job_started","clipId":null}' },
    });
    expect(readJobDonePayload(data)).toBeNull();
  });
});

describe('readJobDonePayload', () => {
  it('exige type job_done et strings', () => {
    expect(readJobDonePayload({ type: 'job_done', clipId: 1 as unknown as string })).toEqual({
      clipId: undefined,
      clipUrl: undefined,
    });
    expect(readJobDonePayload({ type: 'other' })).toBeNull();
  });
});
