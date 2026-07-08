/** @typedef {{ start: number; end: number }} ClipRange */

/** @type {HTMLElement | null} */
let recordingFrame = null;
/** @type {(() => void) | null} */
let recordingFrameLayout = null;

/** @param {HTMLVideoElement} video */
function getCaptureStream(video) {
  if (typeof video.captureStream === 'function') return video.captureStream();
  if (typeof video.mozCaptureStream === 'function') return video.mozCaptureStream();
  return null;
}

/** @param {HTMLVideoElement} video @param {number} time */
function seekTo(video, time) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.05) {
      resolve();
      return;
    }

    const done = () => {
      video.removeEventListener('seeked', done);
      resolve();
    };

    video.addEventListener('seeked', done, { once: true });
    video.currentTime = time;
    window.setTimeout(done, 2000);
  });
}

/** @param {HTMLVideoElement} video @param {number} endTime */
function waitUntilEnd(video, endTime) {
  return new Promise((resolve) => {
    const finish = () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', finish);
      video.pause();
      resolve();
    };

    const onTimeUpdate = () => {
      if (video.currentTime >= endTime - 0.05) {
        finish();
      }
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', finish);
    onTimeUpdate();
  });
}

/** @param {HTMLVideoElement} video */
function showRecordingFrame(video) {
  hideRecordingFrame();

  const frame = document.createElement('div');
  frame.className = 'clippy-recording-frame';
  frame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(frame);
  recordingFrame = frame;

  const update = () => {
    if (!recordingFrame) return;
    const rect = video.getBoundingClientRect();
    recordingFrame.style.top = `${rect.top}px`;
    recordingFrame.style.left = `${rect.left}px`;
    recordingFrame.style.width = `${rect.width}px`;
    recordingFrame.style.height = `${rect.height}px`;
  };

  recordingFrameLayout = update;
  update();
  window.addEventListener('resize', update, { passive: true });
  window.addEventListener('scroll', update, { passive: true, capture: true });
}

function hideRecordingFrame() {
  if (recordingFrameLayout) {
    window.removeEventListener('resize', recordingFrameLayout);
    window.removeEventListener('scroll', recordingFrameLayout, true);
    recordingFrameLayout = null;
  }

  recordingFrame?.remove();
  recordingFrame = null;
}

function showRecordingChrome(video) {
  showStatusBadge('Enregistrement…');
  showRecordingFrame(video);
}

function hideRecordingChrome() {
  hideStatusBadge();
  hideRecordingFrame();
}

/** @param {HTMLVideoElement} video @param {ClipRange} clip */
async function recordClipWithCaptureStream(video, clip) {
  const captureStream = getCaptureStream(video);
  if (!captureStream) {
    throw new Error('capture_stream_unavailable');
  }

  const mimeType = pickRecorderMimeType();
  const chunks = [];
  const recorder = new MediaRecorder(captureStream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 4_000_000,
  });

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const previousRate = video.playbackRate;
  video.playbackRate = 1;
  showRecordingChrome(video);

  try {
    video.pause();
    await seekTo(video, clip.start);
    await waitForVideoFrame(video);

    const stopped = new Promise((resolve) => {
      recorder.addEventListener('stop', () => resolve(), { once: true });
    });

    recorder.start(250);
    await video.play();
    await waitForPlaybackStarted(video);
    await waitUntilEnd(video, clip.end);

    if (recorder.state === 'recording') {
      recorder.requestData();
      recorder.stop();
    }

    await stopped;
  } finally {
    video.playbackRate = previousRate;
    hideRecordingChrome();
  }

  const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
  if (blob.size < 1024) {
    throw new Error('empty_recording');
  }

  return blob;
}

/** @param {Blob} blob @param {string} filename @param {ClipRange} clip */
async function uploadRecordedClip(blob, filename, clip) {
  const { workerUrl = globalThis.CLIPPY_DEFAULT_WORKER_URL } = await chrome.storage.sync.get('workerUrl');
  if (!workerUrl) {
    throw new Error('missing_worker_url');
  }

  const youtubeUrl = window.location.href;
  const videoId = getYoutubeVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error('missing_video_id');
  }

  const title = document.title.replace(/\s*-\s*YouTube\s*$/i, '').trim();

  showStatusBadge('Envoi du clip…');

  try {
    const result = await uploadClip(
      {
        blob,
        filename,
        videoId,
        videoTitle: title,
        youtubeUrl,
        clipStart: clip.start,
        clipEnd: clip.end,
      },
      workerUrl,
    );

    clippyLog('record', 'upload:done', { id: result.id, galleryUrl: result.galleryUrl });
    chrome.tabs.create({ url: result.galleryUrl });
    return result;
  } finally {
    hideStatusBadge();
  }
}

/** @param {ClipRange} clip */
async function startClipRecording(clip) {
  const video = getVideo();
  if (!video) {
    throw new Error('no_video');
  }

  const clipDuration = clip.end - clip.start;
  if (clipDuration > MAX_CLIP_SECONDS) {
    throw new Error('clip_too_long');
  }

  const title = document.title.replace(/\s*-\s*YouTube\s*$/i, '').trim();
  const safeTitle = sanitizeFilename(title).replace(/\.+$/g, '');

  clippyLog('record', 'start', { clip });

  const rawBlob = await recordClipWithCaptureStream(video, clip);
  clippyLog('record', 'done', { bytes: rawBlob.size, type: rawBlob.type });

  let blob = rawBlob;
  if (needsMp4Conversion(rawBlob)) {
    showStatusBadge('Conversion en MP4…');
    try {
      blob = await ensureMp4Blob(rawBlob);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      clippyLog('record', 'transcode:fail', { error: message });
      throw new Error('transcode_failed');
    }
  }

  const extension = clipExtensionFromMime(blob.type);
  const filename = `clippy-${safeTitle}.${extension}`;

  await uploadRecordedClip(blob, filename, clip);
}

globalThis.startClipRecording = startClipRecording;
