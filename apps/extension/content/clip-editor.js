// Clip editor — over-video panel, filmstrip cache, frame preview

const CLIPPY_PANEL_INSET = 10;
const CLIPPY_FILMSTRIP_COUNT = 16;

/** @type {Map<string, string[]>} videoId → dataURL frames */
const filmstripCache = new Map();

function clearFilmstripCache() {
  filmstripCache.clear();
  clippyLog('editor', 'filmstrip:cleared');
}

globalThis.clearFilmstripCache = clearFilmstripCache;

class ClipEditor {
  /** @type {HTMLElement | null} */
  #root = null;
  /** @type {HTMLVideoElement | null} */
  #video = null;
  #videoId = '';
  #duration = 0;
  #clipStart = 0;
  #clipEnd = 0;
  /** @type {((clip: { start: number; end: number }) => void) | null} */
  #onSave = null;
  #onTimeUpdate = null;
  #onLayoutChange = null;
  #onFullscreenChange = null;
  #onKeyDown = null;
  #onKeyUp = null;
  /** @type {ResizeObserver | null} */
  #layoutObserver = null;
  #layoutRaf = 0;
  #saving = false;
  /** @type {AbortController | null} */
  #filmstripAbort = null;
  /** @type {'left' | 'right' | 'move' | 'playhead' | null} */
  #dragMode = null;
  #previewRaf = 0;
  #filmstripToken = 0;

  /** @param {{ onSave?: (clip: { start: number; end: number }) => void }} [options] */
  constructor(options = {}) {
    this.#onSave = options.onSave ?? null;
  }

  get isOpen() {
    return Boolean(this.#root);
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {number} defaultDuration seconds
   */
  open(video, defaultDuration) {
    if (this.isOpen) {
      this.close();
      return;
    }

    this.#video = video;
    this.#videoId = getYoutubeVideoId(window.location.href) || video.currentSrc || 'unknown';
    this.#duration = video.duration;
    if (!Number.isFinite(this.#duration) || this.#duration <= 0) return;

    const current = video.currentTime;
    const length = Math.min(defaultDuration, this.#duration);
    this.#clipEnd = current;
    this.#clipStart = Math.max(0, current - length);

    const normalized = normalizeClip(this.#clipStart, this.#clipEnd, this.#duration, globalThis.MIN_CLIP_SECONDS);
    this.#clipStart = normalized.start;
    this.#clipEnd = normalized.end;

    video.pause();
    this.#mount();
    this.#bindLayout();
    this.#render();
    // Second pass once panel height is known (always 10px from bottom of player).
    requestAnimationFrame(() => this.#scheduleLayout());
    this.#startFilmstrip();
  }

  close() {
    this.#filmstripAbort?.abort();
    this.#filmstripAbort = null;
    this.#filmstripToken += 1;
    cancelAnimationFrame(this.#previewRaf);

    if (this.#video && this.#onTimeUpdate) {
      this.#video.removeEventListener('timeupdate', this.#onTimeUpdate);
      this.#video.removeEventListener('seeked', this.#onTimeUpdate);
    }

    if (this.#onLayoutChange) {
      window.removeEventListener('resize', this.#onLayoutChange);
      window.removeEventListener('scroll', this.#onLayoutChange, true);
    }

    if (this.#onFullscreenChange) {
      document.removeEventListener('fullscreenchange', this.#onFullscreenChange);
    }

    if (this.#onKeyDown) {
      document.removeEventListener('keydown', this.#onKeyDown, true);
    }

    if (this.#onKeyUp) {
      document.removeEventListener('keyup', this.#onKeyUp, true);
    }

    cancelAnimationFrame(this.#layoutRaf);
    this.#layoutObserver?.disconnect();
    this.#layoutObserver = null;
    this.#onLayoutChange = null;
    this.#onFullscreenChange = null;
    this.#onKeyDown = null;
    this.#onKeyUp = null;
    this.#dragMode = null;

    this.#root?.remove();
    this.#root = null;
    this.#video = null;
  }

  #triggerSave() {
    if (this.#saving) {
      clippyLog('editor', 'save:ignored_busy');
      return;
    }
    const clip = { start: this.#clipStart, end: this.#clipEnd };
    clippyLog('editor', 'save:click', clip);
    this.#saving = true;
    this.close();
    Promise.resolve(this.#onSave?.(clip)).finally(() => {
      this.#saving = false;
    });
  }

  /** @returns {HTMLElement | null} */
  #getPlayerElement() {
    const player = document.querySelector('#movie_player');
    if (player instanceof HTMLElement) return player;
    const closest = this.#video?.closest('.html5-video-player');
    return closest instanceof HTMLElement ? closest : null;
  }

  /** @returns {DOMRect | null} */
  #getPlayerRect() {
    return this.#getPlayerElement()?.getBoundingClientRect() ?? null;
  }

  /** @returns {DOMRect | null} */
  #getVideoRect() {
    return this.#video?.getBoundingClientRect() ?? this.#getPlayerRect();
  }

  #syncOverlayParent() {
    if (!this.#root) return;
    // Always pin to fullscreen element or body so fixed coords match the player.
    const parent = document.fullscreenElement instanceof HTMLElement ? document.fullscreenElement : document.body;
    if (this.#root.parentElement !== parent) {
      parent.appendChild(this.#root);
    }
  }

  #scheduleLayout() {
    cancelAnimationFrame(this.#layoutRaf);
    this.#layoutRaf = requestAnimationFrame(() => {
      this.#syncOverlayParent();
      this.#updateLayout();
    });
  }

  #mount() {
    const root = document.createElement('div');
    root.className = 'clippy-overlay';
    root.innerHTML = `
      <div class="clippy-shade" data-shade="top" data-action="close"></div>
      <div class="clippy-shade" data-shade="left" data-action="close"></div>
      <div class="clippy-shade" data-shade="right" data-action="close"></div>
      <div class="clippy-shade" data-shade="bottom" data-action="close"></div>

      <div class="clippy-video-frame" data-video-frame aria-hidden="true"></div>

      <div class="clippy-frame-preview" data-frame-preview hidden>
        <canvas data-preview-canvas width="160" height="90"></canvas>
        <div class="clippy-frame-preview-time" data-preview-time></div>
      </div>

      <div class="clippy-panel" data-panel role="dialog" aria-label="Clippy">
        <div class="clippy-panel-meta">
          <span class="clippy-meta-chip" data-meta-start>0:00</span>
          <span class="clippy-meta-duration" data-meta-duration>0:00</span>
          <span class="clippy-meta-chip" data-meta-end>0:00</span>
        </div>

        <div class="clippy-timeline" data-timeline>
          <div class="clippy-filmstrip" data-filmstrip aria-hidden="true"></div>
          <div class="clippy-track" data-track>
            <div class="clippy-region" data-region>
              <div class="clippy-handle clippy-handle-left" data-handle="left" tabindex="0" aria-label="Début"></div>
              <div class="clippy-handle clippy-handle-right" data-handle="right" tabindex="0" aria-label="Fin"></div>
            </div>
            <div class="clippy-playhead" data-playhead aria-label="Position">
              <div class="clippy-playhead-knob"></div>
            </div>
          </div>
        </div>

        <div class="clippy-toolbar">
          <button type="button" class="clippy-btn clippy-btn-ghost" data-action="close">
            Annuler <kbd class="clippy-kbd">Esc</kbd>
          </button>
          <button type="button" class="clippy-btn clippy-btn-primary" data-action="save">
            Clipper <kbd class="clippy-kbd clippy-kbd-on-primary">↵</kbd>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    this.#root = root;

    root.querySelectorAll('[data-action="close"]').forEach((el) => {
      el.addEventListener('click', () => this.close());
    });

    root.querySelector('[data-action="save"]')?.addEventListener('click', () => this.#triggerSave());

    this.#bindTimeline(root.querySelector('[data-timeline]'));
    this.#bindPlayback();
    this.#bindKeys();
  }

  #bindLayout() {
    this.#onLayoutChange = () => this.#scheduleLayout();
    this.#onFullscreenChange = () => this.#scheduleLayout();

    this.#scheduleLayout();

    window.addEventListener('resize', this.#onLayoutChange, { passive: true });
    window.addEventListener('scroll', this.#onLayoutChange, { passive: true, capture: true });
    document.addEventListener('fullscreenchange', this.#onFullscreenChange);

    const player = this.#getPlayerElement();
    this.#layoutObserver = new ResizeObserver(this.#onLayoutChange);
    if (player) this.#layoutObserver.observe(player);
    if (this.#video) this.#layoutObserver.observe(this.#video);
  }

  #updateLayout() {
    if (!this.#root) return;

    // Prefer player box (#movie_player) so theater / fullscreen stay consistent.
    const anchorRect = this.#getPlayerRect() ?? this.#getVideoRect();
    const frame = this.#root.querySelector('[data-video-frame]');
    const panel = this.#root.querySelector('[data-panel]');
    const shades = {
      top: this.#root.querySelector('[data-shade="top"]'),
      left: this.#root.querySelector('[data-shade="left"]'),
      right: this.#root.querySelector('[data-shade="right"]'),
      bottom: this.#root.querySelector('[data-shade="bottom"]'),
    };

    if (!anchorRect || !(frame instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const inset = CLIPPY_PANEL_INSET;

    const holeTop = anchorRect.top;
    const holeLeft = anchorRect.left;
    const holeRight = anchorRect.right;
    const holeBottom = anchorRect.bottom;

    if (shades.top instanceof HTMLElement) {
      shades.top.style.cssText = `top:0;left:0;width:${viewportW}px;height:${Math.max(0, holeTop)}px`;
    }
    if (shades.left instanceof HTMLElement) {
      shades.left.style.cssText = `top:${holeTop}px;left:0;width:${Math.max(0, holeLeft)}px;height:${anchorRect.height}px`;
    }
    if (shades.right instanceof HTMLElement) {
      shades.right.style.cssText = `top:${holeTop}px;left:${holeRight}px;width:${Math.max(0, viewportW - holeRight)}px;height:${anchorRect.height}px`;
    }
    if (shades.bottom instanceof HTMLElement) {
      shades.bottom.style.cssText = `top:${holeBottom}px;left:0;width:${viewportW}px;height:${Math.max(0, viewportH - holeBottom)}px`;
    }

    frame.style.top = `${anchorRect.top}px`;
    frame.style.left = `${anchorRect.left}px`;
    frame.style.width = `${anchorRect.width}px`;
    frame.style.height = `${anchorRect.height}px`;

    // Always overlay the player: 10px from left, right, and bottom edges.
    const panelWidth = Math.max(0, anchorRect.width - inset * 2);
    const panelHeight = panel.offsetHeight || 110;
    const panelLeft = anchorRect.left + inset;
    const panelTop = anchorRect.bottom - panelHeight - inset;

    panel.style.width = `${panelWidth}px`;
    panel.style.left = `${panelLeft}px`;
    panel.style.top = `${panelTop}px`;
  }

  #bindPlayback() {
    if (!this.#video) return;

    this.#onTimeUpdate = () => {
      this.#render();
      if (this.#dragMode === 'left' || this.#dragMode === 'right' || this.#dragMode === 'playhead') {
        this.#updateFramePreview();
      }
    };

    this.#video.addEventListener('timeupdate', this.#onTimeUpdate);
    this.#video.addEventListener('seeked', this.#onTimeUpdate);
  }

  #bindKeys() {
    this.#onKeyDown = (e) => {
      if (!this.isOpen) return;
      if (e.isComposing) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.close();
        return;
      }

      // Enter = clip (no modifier required)
      if (e.key === 'Enter' && !e.altKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.#triggerSave();
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.#togglePlay();
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopImmediatePropagation();
        const step = e.shiftKey ? 1 : 0.2;
        const delta = e.key === 'ArrowLeft' ? -step : step;
        if (e.altKey) {
          this.#clipStart = clamp(this.#clipStart + delta, 0, this.#clipEnd - globalThis.MIN_CLIP_SECONDS);
          this.#seekTo(this.#clipStart);
        } else if (e.metaKey || e.ctrlKey) {
          this.#clipEnd = clamp(this.#clipEnd + delta, this.#clipStart + globalThis.MIN_CLIP_SECONDS, this.#duration);
          this.#seekTo(this.#clipEnd);
        } else {
          this.#seekTo((this.#video?.currentTime ?? 0) + delta);
        }
        this.#render();
        this.#showFramePreviewAt(this.#video?.currentTime ?? 0, null);
      }
    };

    this.#onKeyUp = (e) => {
      if (!this.isOpen) return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };

    document.addEventListener('keydown', this.#onKeyDown, true);
    document.addEventListener('keyup', this.#onKeyUp, true);
  }

  #togglePlay() {
    if (!this.#video) return;
    if (this.#video.paused) {
      void this.#video.play();
    } else {
      this.#video.pause();
    }
  }

  /** @param {Element | null} timeline */
  #bindTimeline(timeline) {
    if (!timeline || !(timeline instanceof HTMLElement)) return;

    const track = timeline.querySelector('[data-track]');
    const region = timeline.querySelector('[data-region]');
    const playhead = timeline.querySelector('[data-playhead]');
    const leftHandle = timeline.querySelector('[data-handle="left"]');
    const rightHandle = timeline.querySelector('[data-handle="right"]');

    if (
      !(track instanceof HTMLElement) ||
      !(region instanceof HTMLElement) ||
      !(playhead instanceof HTMLElement) ||
      !(leftHandle instanceof HTMLElement) ||
      !(rightHandle instanceof HTMLElement)
    ) {
      return;
    }

    /** @type {'move' | 'left' | 'right' | 'playhead' | null} */
    let mode = null;
    let pointerId = null;
    let originX = 0;
    let originStart = 0;
    let originEnd = 0;

    const timeAt = (clientX) => {
      const rect = track.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      return ratio * this.#duration;
    };

    const onPointerDown = (e, nextMode) => {
      if (!(e instanceof PointerEvent)) return;
      this.#filmstripAbort?.abort();
      mode = nextMode;
      this.#dragMode = nextMode;
      pointerId = e.pointerId;
      originX = e.clientX;
      originStart = this.#clipStart;
      originEnd = this.#clipEnd;
      e.currentTarget?.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();

      if (nextMode === 'left') this.#seekTo(this.#clipStart);
      if (nextMode === 'right') this.#seekTo(this.#clipEnd);
      this.#showFramePreviewAt(
        nextMode === 'right' ? this.#clipEnd : nextMode === 'left' ? this.#clipStart : timeAt(e.clientX),
        nextMode === 'left' || nextMode === 'right' ? nextMode : null,
      );
    };

    track.addEventListener('pointerdown', (e) => {
      if (e.target === leftHandle || e.target === rightHandle) return;
      if (
        region.contains(/** @type {Node} */ (e.target)) &&
        e.target !== playhead &&
        !playhead.contains(/** @type {Node} */ (e.target))
      ) {
        return;
      }
      onPointerDown(e, 'playhead');
      this.#seekTo(timeAt(e.clientX));
      this.#render();
    });

    region.addEventListener('pointerdown', (e) => {
      if (
        e.target === leftHandle ||
        e.target === rightHandle ||
        e.target === playhead ||
        playhead.contains(/** @type {Node} */ (e.target))
      ) {
        return;
      }
      onPointerDown(e, 'move');
    });

    playhead.addEventListener('pointerdown', (e) => onPointerDown(e, 'playhead'));
    leftHandle.addEventListener('pointerdown', (e) => onPointerDown(e, 'left'));
    rightHandle.addEventListener('pointerdown', (e) => onPointerDown(e, 'right'));

    const onPointerMove = (e) => {
      if (mode === null || e.pointerId !== pointerId) return;

      if (mode === 'playhead') {
        const t = timeAt(e.clientX);
        this.#seekTo(t);
        this.#showFramePreviewAt(t, null);
        this.#render();
        return;
      }

      const delta = timeAt(e.clientX) - timeAt(originX);

      if (mode === 'move') {
        const length = originEnd - originStart;
        let start = originStart + delta;
        let end = originEnd + delta;
        if (start < 0) {
          start = 0;
          end = length;
        }
        if (end > this.#duration) {
          end = this.#duration;
          start = end - length;
        }
        this.#clipStart = start;
        this.#clipEnd = end;
        this.#hideFramePreview();
      } else if (mode === 'left') {
        const end = originEnd;
        const start = clamp(originStart + delta, 0, end - globalThis.MIN_CLIP_SECONDS);
        this.#clipStart = start;
        this.#clipEnd = end;
        this.#seekTo(start);
        this.#showFramePreviewAt(start, 'left');
      } else if (mode === 'right') {
        const start = originStart;
        const end = clamp(originEnd + delta, start + globalThis.MIN_CLIP_SECONDS, this.#duration);
        this.#clipStart = start;
        this.#clipEnd = end;
        this.#seekTo(end);
        this.#showFramePreviewAt(end, 'right');
      }

      this.#render();
    };

    const onPointerUp = (e) => {
      if (e.pointerId !== pointerId) return;
      mode = null;
      pointerId = null;
      this.#dragMode = null;
      this.#hideFramePreview();
    };

    timeline.addEventListener('pointermove', onPointerMove);
    timeline.addEventListener('pointerup', onPointerUp);
    timeline.addEventListener('pointercancel', onPointerUp);
  }

  #seekTo(time) {
    if (this.#video) {
      this.#video.currentTime = clamp(time, 0, this.#duration);
    }
  }

  /**
   * @param {number} time
   * @param {'left' | 'right' | null} handle
   */
  #showFramePreviewAt(time, handle) {
    if (!this.#root || !this.#video) return;
    const preview = this.#root.querySelector('[data-frame-preview]');
    const canvas = this.#root.querySelector('[data-preview-canvas]');
    const timeEl = this.#root.querySelector('[data-preview-time]');
    const track = this.#root.querySelector('[data-track]');
    if (
      !(preview instanceof HTMLElement) ||
      !(canvas instanceof HTMLCanvasElement) ||
      !(timeEl instanceof HTMLElement) ||
      !(track instanceof HTMLElement)
    ) {
      return;
    }

    const rect = track.getBoundingClientRect();
    const ratio = this.#duration > 0 ? clamp(time / this.#duration, 0, 1) : 0;
    let x = rect.left + ratio * rect.width;
    const previewW = 160;
    x = clamp(x, rect.left + previewW / 2, rect.right - previewW / 2);

    preview.hidden = false;
    preview.style.left = `${x}px`;
    preview.style.top = `${rect.top - 8}px`;
    preview.dataset.handle = handle || '';
    timeEl.textContent = formatDuration(time);

    cancelAnimationFrame(this.#previewRaf);
    this.#previewRaf = requestAnimationFrame(() => {
      this.#paintPreviewCanvas(canvas);
    });
  }

  #updateFramePreview() {
    if (!this.#video || !this.#dragMode) return;
    if (this.#dragMode === 'left') {
      this.#showFramePreviewAt(this.#clipStart, 'left');
    } else if (this.#dragMode === 'right') {
      this.#showFramePreviewAt(this.#clipEnd, 'right');
    } else if (this.#dragMode === 'playhead') {
      this.#showFramePreviewAt(this.#video.currentTime, null);
    }
  }

  #hideFramePreview() {
    const preview = this.#root?.querySelector('[data-frame-preview]');
    if (preview instanceof HTMLElement) preview.hidden = true;
  }

  /** @param {HTMLCanvasElement} canvas */
  #paintPreviewCanvas(canvas) {
    const video = this.#video;
    if (!video || video.readyState < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vw = video.videoWidth || 16;
    const vh = video.videoHeight || 9;
    const maxW = 160;
    const maxH = 90;
    const scale = Math.min(maxW / vw, maxH / vh);
    const w = Math.max(1, Math.round(vw * scale));
    const h = Math.max(1, Math.round(vh * scale));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    try {
      ctx.drawImage(video, 0, 0, w, h);
    } catch {
      /* ignore */
    }
  }

  /**
   * @param {HTMLElement} strip
   * @param {string[]} frames
   */
  #paintFilmstripFromCache(strip, frames) {
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

  async #startFilmstrip() {
    if (!this.#root || !this.#video) return;
    const strip = this.#root.querySelector('[data-filmstrip]');
    if (!(strip instanceof HTMLElement)) return;

    const count = CLIPPY_FILMSTRIP_COUNT;
    const cacheKey = `${this.#videoId}:${Math.round(this.#duration)}:${count}`;
    const cached = filmstripCache.get(cacheKey);
    if (cached?.length === count) {
      this.#paintFilmstripFromCache(strip, cached);
      clippyLog('editor', 'filmstrip:cache_hit', { key: cacheKey });
      return;
    }

    this.#filmstripAbort?.abort();
    const ac = new AbortController();
    this.#filmstripAbort = ac;
    const token = ++this.#filmstripToken;

    const video = this.#video;
    const duration = this.#duration;

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
        if (ac.signal.aborted || token !== this.#filmstripToken || !this.isOpen) return;
        const t = count === 1 ? 0 : (i / (count - 1)) * duration;
        await seek(t);
        if (ac.signal.aborted || token !== this.#filmstripToken) return;
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
        filmstripCache.set(cacheKey, frames);
        clippyLog('editor', 'filmstrip:cached', { key: cacheKey, n: frames.length });
      }
    } finally {
      if (token === this.#filmstripToken && this.#video === video) {
        video.currentTime = restoreTime;
        if (wasPaused) video.pause();
      }
    }
  }

  #render() {
    if (!this.#root || !this.#video) return;

    const pct = (t) => `${(t / this.#duration) * 100}%`;
    const region = this.#root.querySelector('[data-region]');
    const playhead = this.#root.querySelector('[data-playhead]');
    const videoFrame = this.#root.querySelector('[data-video-frame]');
    const metaStart = this.#root.querySelector('[data-meta-start]');
    const metaEnd = this.#root.querySelector('[data-meta-end]');
    const metaDuration = this.#root.querySelector('[data-meta-duration]');

    const currentTime = this.#video.currentTime;
    const inClip = isTimeInClip(currentTime, this.#clipStart, this.#clipEnd);
    const clipLen = this.#clipEnd - this.#clipStart;

    if (region instanceof HTMLElement) {
      region.style.left = pct(this.#clipStart);
      region.style.width = pct(clipLen);
    }

    if (playhead instanceof HTMLElement) {
      playhead.style.left = pct(currentTime);
    }

    if (videoFrame instanceof HTMLElement) {
      videoFrame.classList.toggle('clippy-video-frame--in-clip', inClip);
    }

    if (metaStart) metaStart.textContent = formatDuration(this.#clipStart);
    if (metaEnd) metaEnd.textContent = formatDuration(this.#clipEnd);
    if (metaDuration) metaDuration.textContent = formatDuration(clipLen);
  }
}

window.ClipEditor = ClipEditor;
