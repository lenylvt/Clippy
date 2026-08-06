/**
 * @param {HTMLElement} strip
 * @param {string[]} frames
 */
function paintFilmstripFromCache(strip, frames) {
  strip.innerHTML = '';
  strip.classList.remove('clippy-filmstrip--loading', 'clippy-filmstrip--incomplete');
  strip.dataset.clippyCached = '1';
  strip.style.setProperty('--clippy-film-count', String(frames.length));
  for (const src of frames) {
    if (!src) {
      const placeholder = document.createElement('div');
      placeholder.className = 'clippy-film-cell clippy-film-cell--empty';
      strip.appendChild(placeholder);
      continue;
    }
    const img = document.createElement('img');
    img.className = 'clippy-film-cell';
    img.src = src;
    img.alt = '';
    img.draggable = false;
    strip.appendChild(img);
  }
}

/**
 * @param {HTMLElement} strip
 * @param {number} expected
 */
function filmstripIsComplete(strip, expected) {
  if (strip.dataset.clippyCached === '1') {
    const imgs = strip.querySelectorAll('img.clippy-film-cell');
    return imgs.length >= expected;
  }
  const imgs = strip.querySelectorAll('img.clippy-film-cell');
  return imgs.length >= expected && !strip.classList.contains('clippy-filmstrip--incomplete');
}

/**
 * Try paint from cache synchronously. Returns true on hit.
 * @param {HTMLElement} strip
 * @param {string} videoId
 * @param {number} [count]
 */
function tryPaintFilmstripCache(strip, videoId, count) {
  const n = count ?? globalThis.CLIPPY_FILMSTRIP_COUNT ?? 12;
  const cache = globalThis.getFilmstripCache?.();
  if (!cache) return false;
  const key =
    typeof globalThis.filmstripCacheKey === 'function'
      ? globalThis.filmstripCacheKey(videoId)
      : videoId && videoId !== 'unknown'
        ? videoId
        : '';
  if (!key) return false;
  const cached = cache.get(key);
  if (!cached?.length || !cached.every(Boolean)) return false;
  paintFilmstripFromCache(strip, cached);
  clippyLog('editor', 'filmstrip:cache_hit', { key, n: cached.length });
  return true;
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
 *   skipRestore?: () => boolean;
 *   onBusyChange?: (busy: boolean) => void;
 * }} opts
 * @returns {Promise<'cache' | 'ok' | 'aborted' | 'incomplete' | 'skipped'>}
 */
async function generateEditorFilmstrip(opts) {
  const { strip, video, videoId, duration, signal, isCurrent } = opts;
  const count = opts.count ?? globalThis.CLIPPY_FILMSTRIP_COUNT ?? 12;

  if (!videoId || videoId === 'unknown') {
    clippyLog('editor', 'filmstrip:no_video_id');
  }

  if (filmstripIsComplete(strip, count)) {
    clippyLog('editor', 'filmstrip:skip_painted');
    return 'skipped';
  }

  if (tryPaintFilmstripCache(strip, videoId, count)) {
    return 'cache';
  }

  const cache = globalThis.getFilmstripCache();
  const cacheKey =
    typeof globalThis.filmstripCacheKey === 'function'
      ? globalThis.filmstripCacheKey(videoId, duration, count)
      : videoId && videoId !== 'unknown'
        ? videoId
        : '';

  strip.innerHTML = '';
  strip.removeAttribute('data-clippy-cached');
  strip.classList.add('clippy-filmstrip--loading');
  strip.classList.remove('clippy-filmstrip--incomplete');
  strip.style.setProperty('--clippy-film-count', String(count));

  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cellCssW = Math.max(40, Math.floor(strip.getBoundingClientRect().width / count) || 72);
  const cellCssH = Math.max(28, Math.floor(strip.getBoundingClientRect().height) || 40);
  const cellW = Math.round(cellCssW * dpr);
  const cellH = Math.round(cellCssH * dpr);

  /** @type {HTMLCanvasElement[]} */
  const cells = [];
  for (let i = 0; i < count; i += 1) {
    const cell = document.createElement('canvas');
    cell.className = 'clippy-film-cell';
    cell.width = cellW;
    cell.height = cellH;
    strip.appendChild(cell);
    cells.push(cell);
  }

  const wasPaused = video.paused;
  const restoreTime = video.currentTime;
  opts.onBusyChange?.(true);

  /** @type {number} */
  let seekTimeoutId = 0;

  const seek = (t) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      if (Math.abs(video.currentTime - t) < 0.08) {
        resolve();
        return;
      }

      const cleanup = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        signal.removeEventListener('abort', onAbort);
        if (seekTimeoutId) {
          window.clearTimeout(seekTimeoutId);
          seekTimeoutId = 0;
        }
      };

      const onSeeked = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error('media_error'));
      };

      const onAbort = () => {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
      };

      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onError, { once: true });
      signal.addEventListener('abort', onAbort, { once: true });
      video.currentTime = t;
      seekTimeoutId = window.setTimeout(() => {
        cleanup();
        resolve();
      }, globalThis.CLIPPY_SEEK_TIMEOUT_MS ?? 1500);
    });

  /** @type {string[]} */
  const frames = [];
  const startedAt = performance.now();

  try {
    if (video.readyState < 2 || video.videoWidth <= 0) {
      await new Promise((resolve) => {
        const done = () => {
          video.removeEventListener('loadeddata', done);
          resolve();
        };
        if (video.readyState >= 2 && video.videoWidth > 0) {
          resolve();
          return;
        }
        video.addEventListener('loadeddata', done, { once: true });
        window.setTimeout(done, 800);
      });
    }

    for (let i = 0; i < count; i += 1) {
      if (signal.aborted || !isCurrent()) {
        // Prefer cache restore over leaving a broken strip.
        if (tryPaintFilmstripCache(strip, videoId, count)) return 'cache';
        strip.classList.add('clippy-filmstrip--incomplete');
        return 'aborted';
      }
      const t = count === 1 ? 0 : (i / (count - 1)) * duration;
      try {
        await seek(t);
      } catch (err) {
        if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          if (tryPaintFilmstripCache(strip, videoId, count)) return 'cache';
          strip.classList.add('clippy-filmstrip--incomplete');
          return 'aborted';
        }
        frames.push('');
        continue;
      }
      if (signal.aborted || !isCurrent()) {
        if (tryPaintFilmstripCache(strip, videoId, count)) return 'cache';
        strip.classList.add('clippy-filmstrip--incomplete');
        return 'aborted';
      }
      const canvas = cells[i];
      const ctx = canvas.getContext('2d');
      if (ctx && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const q = globalThis.CLIPPY_FILMSTRIP_QUALITY ?? 0.82;
          frames.push(canvas.toDataURL('image/jpeg', q));
        } catch {
          frames.push('');
        }
      } else {
        frames.push('');
      }
    }

    if (frames.length === count && frames.every(Boolean) && cacheKey) {
      cache.set(cacheKey, frames);
      paintFilmstripFromCache(strip, frames);
      clippyLog('editor', 'filmstrip:cached', {
        key: cacheKey,
        n: frames.length,
        ms: Math.round(performance.now() - startedAt),
      });
      return 'ok';
    }

    if (frames.some(Boolean)) {
      // Still cache partial if majority present — better than re-seeking next open.
      if (cacheKey && frames.filter(Boolean).length >= Math.ceil(count * 0.75)) {
        cache.set(cacheKey, frames.map((f, i) => f || frames.find(Boolean) || ''));
      }
      paintFilmstripFromCache(strip, frames);
      return 'incomplete';
    }

    return 'incomplete';
  } finally {
    strip.classList.remove('clippy-filmstrip--loading');
    opts.onBusyChange?.(false);
    const skip = opts.skipRestore?.() === true;
    if (!skip) {
      try {
        video.currentTime = restoreTime;
        if (wasPaused) video.pause();
      } catch {
        /* ignore */
      }
    }
  }
}

globalThis.paintFilmstripFromCache = paintFilmstripFromCache;
globalThis.filmstripIsComplete = filmstripIsComplete;
globalThis.tryPaintFilmstripCache = tryPaintFilmstripCache;
globalThis.generateEditorFilmstrip = generateEditorFilmstrip;
