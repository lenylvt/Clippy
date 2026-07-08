/** @param {HTMLVideoElement} video */
function isVideoFrameReady(video) {
  return video.readyState >= 3 && !video.seeking;
}

/**
 * Attend une frame décodée (seek terminé + données suffisantes).
 * @param {HTMLVideoElement} video
 * @param {{ timeoutMs?: number }} [options]
 */
function waitForVideoFrame(video, options = {}) {
  const timeoutMs = options.timeoutMs ?? 8000;

  if (isVideoFrameReady(video)) {
    if (video.paused) return Promise.resolve();
    return waitForPaintedFrame(video, { timeoutMs: 2000 });
  }

  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error('frame_timeout'));
    }, timeoutMs);

    const tryResolve = () => {
      if (!isVideoFrameReady(video)) return;
      cleanup();
      if (video.paused) {
        resolve();
        return;
      }
      waitForPaintedFrame(video, { timeoutMs: 2000 }).then(resolve).catch(reject);
    };

    const cleanup = () => {
      globalThis.clearTimeout(timer);
      video.removeEventListener('seeked', tryResolve);
      video.removeEventListener('canplay', tryResolve);
      video.removeEventListener('canplaythrough', tryResolve);
      video.removeEventListener('loadeddata', tryResolve);
    };

    video.addEventListener('seeked', tryResolve);
    video.addEventListener('canplay', tryResolve);
    video.addEventListener('canplaythrough', tryResolve);
    video.addEventListener('loadeddata', tryResolve);
    tryResolve();
  });
}

/**
 * Attend qu'une frame soit peinte à l'écran (lecture en cours uniquement).
 * @param {HTMLVideoElement} video
 * @param {{ timeoutMs?: number }} [options]
 */
function waitForPaintedFrame(video, options = {}) {
  const timeoutMs = options.timeoutMs ?? 2000;

  if (video.paused) {
    return Promise.resolve();
  }

  if (typeof video.requestVideoFrameCallback === 'function') {
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        if (!video.paused && isVideoFrameReady(video)) {
          resolve();
          return;
        }
        reject(new Error('paint_timeout'));
      }, timeoutMs);

      video.requestVideoFrameCallback(() => {
        globalThis.clearTimeout(timer);
        resolve();
      });
    });
  }

  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 120);
  });
}

/**
 * Attend la fin du buffer initial après lecture.
 * @param {HTMLVideoElement} video
 * @param {{ timeoutMs?: number }} [options]
 */
function waitForPlaybackStarted(video, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10_000;

  if (!video.paused && isVideoFrameReady(video)) {
    return waitForPaintedFrame(video, { timeoutMs: 2000 });
  }

  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error('playback_timeout'));
    }, timeoutMs);

    const tryResolve = () => {
      if (video.paused || !isVideoFrameReady(video)) return;
      cleanup();
      waitForPaintedFrame(video, { timeoutMs: 2000 }).then(resolve).catch(reject);
    };

    const cleanup = () => {
      globalThis.clearTimeout(timer);
      video.removeEventListener('playing', tryResolve);
      video.removeEventListener('canplay', tryResolve);
      video.removeEventListener('canplaythrough', tryResolve);
      video.removeEventListener('waiting', tryResolve);
    };

    video.addEventListener('playing', tryResolve);
    video.addEventListener('canplay', tryResolve);
    video.addEventListener('canplaythrough', tryResolve);
    video.addEventListener('waiting', tryResolve);
    tryResolve();
  });
}

globalThis.isVideoFrameReady = isVideoFrameReady;
globalThis.waitForVideoFrame = waitForVideoFrame;
globalThis.waitForPaintedFrame = waitForPaintedFrame;
globalThis.waitForPlaybackStarted = waitForPlaybackStarted;
