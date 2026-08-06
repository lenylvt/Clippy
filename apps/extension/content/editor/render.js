/**
 * @param {{
 *   root: HTMLElement;
 *   video: HTMLVideoElement;
 *   duration: number;
 *   clipStart: number;
 *   clipEnd: number;
 * }} state
 */
function renderEditorPanel(state) {
  const { root, video, duration, clipStart, clipEnd } = state;
  const pct = (t) => `${(t / duration) * 100}%`;
  const region = root.querySelector('[data-region]');
  const playhead = root.querySelector('[data-playhead]');
  const videoFrame = root.querySelector('[data-video-frame]');
  const metaStart = root.querySelector('[data-meta-start]');
  const metaEnd = root.querySelector('[data-meta-end]');
  const metaDuration = root.querySelector('[data-meta-duration]');

  const currentTime = video.currentTime;
  const inClip = isTimeInClip(currentTime, clipStart, clipEnd);
  const clipLen = clipEnd - clipStart;

  if (region instanceof HTMLElement) {
    region.style.left = pct(clipStart);
    region.style.width = pct(clipLen);
  }

  if (playhead instanceof HTMLElement) {
    playhead.style.left = pct(currentTime);
  }

  if (videoFrame instanceof HTMLElement) {
    videoFrame.classList.toggle('clippy-video-frame--in-clip', inClip);
  }

  if (metaStart) metaStart.textContent = formatDuration(clipStart);
  if (metaEnd) metaEnd.textContent = formatDuration(clipEnd);
  if (metaDuration) metaDuration.textContent = formatDuration(clipLen);
}

globalThis.renderEditorPanel = renderEditorPanel;
