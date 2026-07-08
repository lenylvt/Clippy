/** @type {Promise<{ ffmpeg: import('@ffmpeg/ffmpeg').FFmpeg; fetchFile: typeof import('@ffmpeg/util').fetchFile }> | null} */
let ffmpegLoadPromise = null;
/** Keep source in MEMFS across crops of the same video (avoids re-writing 50MB+). */
let loadedSourceId = null;
const SOURCE_NAME = 'source.mp4';

async function loadFfmpeg() {
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const vendorBase = chrome.runtime.getURL('vendor/ffmpeg');
      const { FFmpeg } = await import(/* @vite-ignore */ `${vendorBase}/ffmpeg/index.js`);
      const { fetchFile } = await import(/* @vite-ignore */ `${vendorBase}/util/index.js`);
      const ffmpeg = new FFmpeg();
      // MV3 CSP forbids blob: scripts — load from chrome-extension:// only.
      await ffmpeg.load({
        classWorkerURL: `${vendorBase}/ffmpeg/worker.js`,
        coreURL: `${vendorBase}/ffmpeg-core.js`,
        wasmURL: `${vendorBase}/ffmpeg-core.wasm`,
      });
      return { ffmpeg, fetchFile };
    })();
  }
  return ffmpegLoadPromise;
}

/**
 * @param {import('@ffmpeg/ffmpeg').FFmpeg} ffmpeg
 * @param {typeof import('@ffmpeg/util').fetchFile} fetchFile
 * @param {string} videoId
 * @param {Blob} source
 */
async function ensureSourceInFs(ffmpeg, fetchFile, videoId, source) {
  if (loadedSourceId === videoId) {
    clippyLog('offscreen', 'source:reuse', { videoId });
    return;
  }

  if (loadedSourceId) {
    try {
      await ffmpeg.deleteFile(SOURCE_NAME);
    } catch {
      /* ignore */
    }
  }

  clippyLog('offscreen', 'source:write', { videoId, bytes: source.size });
  await ffmpeg.writeFile(SOURCE_NAME, await fetchFile(source));
  loadedSourceId = videoId;
}

/**
 * Fast path: stream copy (no re-encode). Near-instant, ~0 CPU vs libx264.
 * Cut lands on nearest keyframes (usually fine for clips ≥ a few seconds).
 * @param {import('@ffmpeg/ffmpeg').FFmpeg} ffmpeg
 * @param {number} start
 * @param {number} duration
 * @param {string} outputName
 */
async function cropStreamCopy(ffmpeg, start, duration, outputName) {
  // -ss before -i = fast input seek; -c copy = no decode/encode
  await ffmpeg.exec([
    '-ss',
    String(start),
    '-i',
    SOURCE_NAME,
    '-t',
    String(duration),
    '-c',
    'copy',
    '-avoid_negative_ts',
    'make_zero',
    '-movflags',
    '+faststart',
    outputName,
  ]);
}

/**
 * Slow fallback: re-encode only if stream-copy produced nothing usable.
 * ultrafast + slightly lower quality keeps WASM CPU time down.
 * @param {import('@ffmpeg/ffmpeg').FFmpeg} ffmpeg
 * @param {number} start
 * @param {number} duration
 * @param {string} outputName
 */
async function cropReencode(ffmpeg, start, duration, outputName) {
  await ffmpeg.exec([
    '-ss',
    String(start),
    '-i',
    SOURCE_NAME,
    '-t',
    String(duration),
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '28',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    outputName,
  ]);
}

/**
 * @param {Blob} source
 * @param {string} videoId
 * @param {number} start
 * @param {number} end
 * @returns {Promise<Blob>}
 */
async function cropVideoBlob(source, videoId, start, end) {
  const duration = Math.max(0.1, end - start);
  const { ffmpeg, fetchFile } = await loadFfmpeg();
  const outputName = 'clip.mp4';

  await ensureSourceInFs(ffmpeg, fetchFile, videoId, source);

  try {
    let mode = 'copy';
    try {
      await cropStreamCopy(ffmpeg, start, duration, outputName);
      const probe = await ffmpeg.readFile(outputName);
      const size = probe?.byteLength ?? (Array.isArray(probe) ? probe.length : 0);
      if (size < 2048) {
        throw new Error('copy_too_small');
      }
    } catch (copyError) {
      const msg = copyError instanceof Error ? copyError.message : String(copyError);
      clippyLog('offscreen', 'crop:copy_fallback', { error: msg });
      try {
        await ffmpeg.deleteFile(outputName);
      } catch {
        /* ignore */
      }
      mode = 'reencode';
      await cropReencode(ffmpeg, start, duration, outputName);
    }

    const data = await ffmpeg.readFile(outputName);
    const clip = new Blob([data], { type: 'video/mp4' });
    if (clip.size < 1024) {
      throw new Error('empty_crop');
    }
    clippyLog('offscreen', 'crop:mode', { mode, bytes: clip.size, start, duration });
    return clip;
  } finally {
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      /* ignore */
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OFFSCREEN_PING') {
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === 'OFFSCREEN_RESET_SOURCE') {
    (async () => {
      if (!ffmpegLoadPromise || !loadedSourceId) {
        loadedSourceId = null;
        return { ok: true, cleared: false };
      }
      try {
        const { ffmpeg } = await loadFfmpeg();
        try {
          await ffmpeg.deleteFile(SOURCE_NAME);
        } catch {
          /* ignore */
        }
      } finally {
        loadedSourceId = null;
      }
      clippyLog('offscreen', 'source:cleared');
      return { ok: true, cleared: true };
    })()
      .then((result) => sendResponse(result))
      .catch((error) => {
        loadedSourceId = null;
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return true;
  }

  if (message?.type !== 'OFFSCREEN_CROP') return;

  (async () => {
    const { videoId, start, end, resultKey } = message;
    if (!videoId || !resultKey || typeof start !== 'number' || typeof end !== 'number') {
      throw new Error('invalid_crop_request');
    }

    clippyLog('offscreen', 'crop:start', { videoId, start, end });
    const cached = await getCachedVideo(videoId);
    if (!cached?.blob) {
      throw new Error('cache_miss');
    }

    const clipBlob = await cropVideoBlob(cached.blob, videoId, start, end);
    await putTempBlob(resultKey, clipBlob);
    clippyLog('offscreen', 'crop:done', { videoId, bytes: clipBlob.size, resultKey });
    return { ok: true, bytes: clipBlob.size };
  })()
    .then((result) => sendResponse(result))
    .catch((error) => {
      const messageText = error instanceof Error ? error.message : String(error);
      clippyLog('offscreen', 'crop:fail', { error: messageText });
      sendResponse({ ok: false, error: messageText });
    });

  return true;
});

clippyLog('offscreen', 'ready');
