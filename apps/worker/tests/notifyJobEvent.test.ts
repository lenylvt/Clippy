import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isExpoPushToken,
  isPushPlatform,
  notifyJobEvent,
  shouldPushNotify,
} from '../src/notify/jobEvent';
import {
  EXPO_PUSH_CHUNK,
  EXPO_PUSH_URL,
  sendExpoPush,
  tokensToPurgeFromTickets,
  type ExpoMessage,
} from '../src/notify/expoPush';
import type { Env, JobRow } from '../src/types';

const listPushTokens = vi.hoisted(() => vi.fn());
const deletePushToken = vi.hoisted(() => vi.fn());

vi.mock('../src/db/push', () => ({
  listPushTokens,
  deletePushToken,
  upsertPushToken: vi.fn(),
  MAX_PUSH_TOKENS_PER_USER: 100,
}));

function baseJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: 'job-1',
    status: 'running',
    stage: 'preparing',
    progress: 0.1,
    video_id: 'vid',
    video_title: 'Ma vidéo YouTube',
    youtube_url: 'https://youtube.com/watch?v=vid',
    clip_start: 0,
    clip_end: 10,
    clip_id: null,
    error: null,
    device_token: 'dev',
    user_id: 'user-1',
    slot: 0,
    r2_key: null,
    created_at: 1,
    updated_at: 1,
    expires_at: 2,
    ...overrides,
  };
}

function mockEnv(extra: Partial<Env> = {}): Env {
  return {
    CLIPS: {} as Env['CLIPS'],
    DB: {} as Env['DB'],
    CLIP: {} as Env['CLIP'],
    JOB_QUEUE: {} as Env['JOB_QUEUE'],
    CONTAINER_SECRET: 'secret',
    PUBLIC_ORIGIN: 'https://clippy.example',
    ...extra,
  };
}

describe('shouldPushNotify start + done only', () => {
  it('n’envoie que start et fini', () => {
    expect(shouldPushNotify('started')).toBe(true);
    expect(shouldPushNotify('done')).toBe(true);
    expect(shouldPushNotify('progress')).toBe(false);
    expect(shouldPushNotify('error')).toBe(false);
  });
});

describe('isExpoPushToken / platform', () => {
  it('accepte les formats Expo', () => {
    expect(isExpoPushToken('ExponentPushToken[abc123]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[xyz]')).toBe(true);
  });

  it('rejette invalides / trop longs', () => {
    expect(isExpoPushToken('')).toBe(false);
    expect(isExpoPushToken('not-a-token')).toBe(false);
    expect(isExpoPushToken(`ExponentPushToken[${'x'.repeat(250)}]`)).toBe(false);
  });

  it('allowlist platform', () => {
    expect(isPushPlatform('ios')).toBe(true);
    expect(isPushPlatform('android')).toBe(true);
    expect(isPushPlatform('web')).toBe(false);
  });
});

describe('tokensToPurgeFromTickets', () => {
  it('purge DeviceNotRegistered par index', () => {
    const messages = [
      { to: 'ExponentPushToken[dead]', title: 't', body: 'b' },
      { to: 'ExponentPushToken[live]', title: 't', body: 'b' },
    ] satisfies ExpoMessage[];
    const doomed = tokensToPurgeFromTickets(messages, [
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'ok', id: 'ticket-1' },
    ]);
    expect(doomed).toEqual(['ExponentPushToken[dead]']);
  });
});

describe('sendExpoPush', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    listPushTokens.mockReset();
    deletePushToken.mockReset();
    deletePushToken.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('chunk ≤100 et Authorization si EXPO_ACCESS_TOKEN', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ status: 'ok', id: 't1' }] }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);

    const tokens = Array.from({ length: 101 }, (_, i) => `ExponentPushToken[${i}]`);
    const messages = tokens.map((to) => ({ to, title: 't', body: 'b' }));
    await sendExpoPush(mockEnv({ EXPO_ACCESS_TOKEN: ' expo-secret ' }), messages);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![1].body).toBeDefined();
    const firstBatch = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as ExpoMessage[];
    const secondBatch = JSON.parse(fetchMock.mock.calls[1]![1].body as string) as ExpoMessage[];
    expect(firstBatch).toHaveLength(EXPO_PUSH_CHUNK);
    expect(secondBatch).toHaveLength(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(EXPO_PUSH_URL);
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe('Bearer expo-secret');
  });

  it('retry 5xx puis succès', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'busy',
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ status: 'ok', id: 'ok' }] }),
        text: async () => '',
      });
    vi.stubGlobal('fetch', fetchMock);

    await sendExpoPush(mockEnv(), [{ to: 'ExponentPushToken[a]', title: 't', body: 'b' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('purge DeviceNotRegistered après tickets', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            status: 'error',
            message: 'gone',
            details: { error: 'DeviceNotRegistered' },
          },
        ],
      }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);

    await sendExpoPush(mockEnv(), [
      { to: 'ExponentPushToken[dead]', title: 't', body: 'b' },
    ]);
    expect(deletePushToken).toHaveBeenCalledWith(
      expect.anything(),
      'ExponentPushToken[dead]',
    );
  });
});

describe('notifyJobEvent', () => {
  beforeEach(() => {
    listPushTokens.mockReset();
    deletePushToken.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ignore progress / error / sans user', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await notifyJobEvent(mockEnv(), baseJob(), 'progress');
    await notifyJobEvent(mockEnv(), baseJob(), 'error');
    await notifyJobEvent(mockEnv(), baseJob({ user_id: null }), 'started');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listPushTokens).not.toHaveBeenCalled();
  });

  it('envoie started avec PUBLIC_ORIGIN et body fallback', async () => {
    listPushTokens.mockResolvedValue(['ExponentPushToken[tok]']);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ status: 'ok', id: '1' }] }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);

    await notifyJobEvent(mockEnv(), baseJob({ video_title: '   ' }), 'started');

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as ExpoMessage[];
    expect(body[0]!.title).toBe('Clip démarré');
    expect(body[0]!.body).toBe('Sans titre');
    expect(body[0]!.data).toEqual({
      type: 'job_started',
      jobId: 'job-1',
      clipId: null,
      clipUrl: undefined,
    });
    expect(body[0]!.interruptionLevel).toBe('passive');
  });

  it('envoie done avec clipUrl via PUBLIC_ORIGIN', async () => {
    listPushTokens.mockResolvedValue(['ExponentPushToken[tok]']);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ status: 'ok', id: '1' }] }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);

    await notifyJobEvent(
      mockEnv(),
      baseJob({ status: 'done', stage: 'done', clip_id: 'clip-9', progress: 1 }),
      'done',
    );

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as ExpoMessage[];
    expect(body[0]!.title).toBe('Clip prêt');
    expect(String(body[0]!.data?.clipUrl)).toMatch(
      /^https:\/\/clippy\.example\/clips\/clip-9\?exp=\d+&sig=[a-f0-9]{64}$/,
    );
    expect(body[0]!.priority).toBe('high');
  });

  it('ne throw pas si listPushTokens échoue', async () => {
    listPushTokens.mockRejectedValue(new Error('d1 down'));
    await expect(notifyJobEvent(mockEnv(), baseJob(), 'started')).resolves.toBeUndefined();
  });
});
