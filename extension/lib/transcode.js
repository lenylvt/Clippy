/** @param {Blob} blob */
function needsMp4Conversion(blob) {
  return !blob.type.toLowerCase().includes('mp4');
}

/** @type {Promise<{ ffmpeg: import('@ffmpeg/ffmpeg').FFmpeg; fetchFile: typeof import('@ffmpeg/util').fetchFile }> | null} */
let ffmpegLoadPromise = null;

async function loadFfmpeg() {
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const { FFmpeg } = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js');
      const { fetchFile, toBlobURL } = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js');
      const ffmpeg = new FFmpeg();
      const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
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
