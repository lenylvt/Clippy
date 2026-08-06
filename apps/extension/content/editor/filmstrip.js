/**
 * @param {HTMLElement} strip
 * @param {string[]} frames
 */
function paintFilmstripFromCache(strip, frames) {
  strip.innerHTML = '';
  strip.style.setProperty('--clippy-film-count', String(frames.length));
  for (const src of frames) {
    const img = document.createElement('img');
    img.className = 'clippy-film-cell';
    img.src = src;
    img.alt = '';
    img.draggable = false;
    strip.appendChild(img);
  }
}

/**
 * @param {{
 *   strip: HTMLElement;
 *   video: HTMLVideoElement;
 *   videoId: string;
 *   duration: number;
 *   count?: number;
 *   signal: AbortSignal;
 *   isCurrent: () => boolean;
 * }} opts
 */
async function generateEditorFilmstrip(opts) {
  const count = opts.count ?? globalThis.CLIPPY_FILMSTRIP_COUNT;
  const { strip, video, videoId, duration, signal, isCurrent } = opts;
  const cache = globalThis.getFilmstripCache();
  const cacheKey = `${videoId}:${Math.round(duration)}:${count}`;
  const cached = cache.get(cacheKey);
  if (cached?.length === count) {
    paintFilmstripFromCache(strip, cached);
    clippyLog('editor', 'filmstrip:cache_hit', { key: cacheKey });
    return;
  }

  strip.innerHTML = '';
  strip.style.setProperty('--clippy-film-count', String(count));

  /** @type {HTMLCanvasElement[]} */
  const cells = [];
  for (let i = 0; i < count; i += 1) {
    const cell = document.createElement('canvas');
    cell.className = 'clippy-film-cell';
    cell.width = 64;
    cell.height = 36;
    strip.appendChild(cell);
    cells.push(cell);
  }

  const wasPaused = video.paused;
  const restoreTime = video.currentTime;

  const seek = (t) =>
    new Promise((resolve) => {
      if (Math.abs(video.currentTime - t) < 0.04) {
        resolve();
        return;
      }
      const done = () => {
        video.removeEventListener('seeked', done);
        resolve();
      };
      video.addEventListener('seeked', done, { once: true });
      video.currentTime = t;
      window.setTimeout(done, 400);
    });

  /** @type {string[]} */
  const frames = [];

  try {
    for (let i = 0; i < count; i += 1) {
      if (signal.aborted || !isCurrent()) return;
      const t = count === 1 ? 0 : (i / (count - 1)) * duration;
      await seek(t);
      if (signal.aborted || !isCurrent()) return;
      const canvas = cells[i];
      const ctx = canvas.getContext('2d');
      if (ctx) {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL('image/jpeg', 0.7));
        } catch {
          frames.push('');
        }
      } else {
        frames.push('');
      }
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    }

    if (frames.length === count && frames.some(Boolean)) {
      cache.set(cacheKey, frames);
      clippyLog('editor', 'filmstrip:cached', { key: cacheKey, n: frames.length });
    }
  } finally {
    if (isCurrent()) {
      video.currentTime = restoreTime;
      if (wasPaused) video.pause();
    }
  }
}

globalThis.paintFilmstripFromCache = paintFilmstripFromCache;
globalThis.generateEditorFilmstrip = generateEditorFilmstrip;
