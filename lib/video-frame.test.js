import { describe, expect, it, vi } from 'vitest';
import './video-frame.js';

function createVideoStub(overrides = {}) {
  const listeners = new Map();

  return {
    readyState: 0,
    seeking: false,
    paused: true,
    requestVideoFrameCallback: null,
    addEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      listeners.set(
        type,
        list.filter((entry) => entry !== handler),
      );
    },
    emit(type) {
      for (const handler of listeners.get(type) ?? []) {
        handler();
      }
    },
    ...overrides,
  };
}

describe('isVideoFrameReady', () => {
  it('retourne true quand la vidéo a assez de données et ne seek pas', () => {
    expect(isVideoFrameReady(createVideoStub({ readyState: 3, seeking: false }))).toBe(true);
  });

  it('retourne false pendant un seek ou sans données', () => {
    expect(isVideoFrameReady(createVideoStub({ readyState: 3, seeking: true }))).toBe(false);
    expect(isVideoFrameReady(createVideoStub({ readyState: 2, seeking: false }))).toBe(false);
  });
});

describe('waitForVideoFrame', () => {
  it('résout immédiatement si la frame est prête en pause', async () => {
    const video = createVideoStub({
      readyState: 4,
      seeking: false,
      paused: true,
    });

    await waitForVideoFrame(video);
  });

  it('utilise requestVideoFrameCallback en lecture', async () => {
    vi.useFakeTimers();
    const video = createVideoStub({
      readyState: 4,
      seeking: false,
      paused: false,
      requestVideoFrameCallback: (cb) => {
        cb();
        return 1;
      },
    });

    await waitForVideoFrame(video);
    vi.useRealTimers();
  });

  it('attend seeked puis résout en pause', async () => {
    vi.useFakeTimers();
    const video = createVideoStub({
      readyState: 2,
      seeking: true,
      paused: true,
    });

    const promise = waitForVideoFrame(video);
    video.readyState = 4;
    video.seeking = false;
    video.emit('seeked');
    await promise;
    vi.useRealTimers();
  });
});

describe('waitForPlaybackStarted', () => {
  it('résout quand la lecture démarre avec une frame prête', async () => {
    vi.useFakeTimers();
    const video = createVideoStub({
      readyState: 2,
      paused: true,
      requestVideoFrameCallback: (cb) => {
        cb();
        return 1;
      },
    });

    const promise = waitForPlaybackStarted(video);
    video.paused = false;
    video.readyState = 4;
    video.emit('playing');
    await promise;
    vi.useRealTimers();
  });
});
