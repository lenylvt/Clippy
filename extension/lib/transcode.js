/** @param {Blob} blob */
function needsMp4Conversion(blob) {
  if (blob.type.toLowerCase().includes('mp4')) {
    return false;
  }

  return shouldUsePlaybackConvert(
    navigator.userAgent,
    navigator.platform,
    navigator.maxTouchPoints,
  );
}

/** @type {Promise<{ ffmpeg: import('@ffmpeg/ffmpeg').FFmpeg; fetchFile: typeof import('@ffmpeg/util').fetchFile }> | null} */
let ffmpegLoadPromise = null;

async function loadFfmpeg() {
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const vendorBase = chrome.runtime.getURL('vendor/ffmpeg');
      const { FFmpeg } = await import(/* @vite-ignore */ `${vendorBase}/ffmpeg/index.js`);
      const { fetchFile } = await import(/* @vite-ignore */ `${vendorBase}/util/index.js`);
      const ffmpeg = new FFmpeg();
      // MV3 CSP forbids blob: scripts — use extension URLs only.
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

/** @param {Blob} webmBlob */
async function convertWebmToMp4(webmBlob) {
  const { ffmpeg, fetchFile } = await loadFfmpeg();
  await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob));
  await ffmpeg.exec([
    '-i',
    'input.webm',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    'output.mp4',
  ]);
  const data = await ffmpeg.readFile('output.mp4');
  const mp4Blob = new Blob([data], { type: 'video/mp4' });
  if (mp4Blob.size < 1024) {
    throw new Error('empty_transcode');
  }
  return mp4Blob;
}

/**
 * @param {Blob} blob
 * @returns {Promise<Blob>}
 */
async function ensureMp4Blob(blob) {
  if (!needsMp4Conversion(blob)) {
    return blob;
  }

  clippyLog('transcode', 'start', { bytes: blob.size, type: blob.type });
  const mp4Blob = await convertWebmToMp4(blob);
  clippyLog('transcode', 'done', { bytes: mp4Blob.size });
  return mp4Blob;
}

globalThis.needsMp4Conversion = needsMp4Conversion;
globalThis.ensureMp4Blob = ensureMp4Blob;
