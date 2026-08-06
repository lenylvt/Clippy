/**
 * @param {HTMLVideoElement} video
 * @param {number} duration
 * @param {number} time
 */
function seekEditorVideo(video, duration, time) {
  video.currentTime = clamp(time, 0, duration);
}

/**
 * @param {HTMLVideoElement} video
 */
function toggleEditorPlayback(video) {
  if (video.paused) {
    const playResult = video.play();
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch(() => {
        clippyLog('editor', 'playback:play_rejected');
      });
    }
  } else {
    video.pause();
  }
}

/**
 * @param {HTMLVideoElement} video
 * @param {() => void} onTimeUpdate
 * @returns {() => void} unbind
 */
function bindEditorPlayback(video, onTimeUpdate) {
  // seeked covers scrub; timeupdate covers continuous play — both needed.
  video.addEventListener('timeupdate', onTimeUpdate);
  video.addEventListener('seeked', onTimeUpdate);
  return () => {
    video.removeEventListener('timeupdate', onTimeUpdate);
    video.removeEventListener('seeked', onTimeUpdate);
  };
}

globalThis.seekEditorVideo = seekEditorVideo;
globalThis.toggleEditorPlayback = toggleEditorPlayback;
globalThis.bindEditorPlayback = bindEditorPlayback;
