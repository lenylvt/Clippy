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
    void video.play();
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
