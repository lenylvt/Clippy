// Clip editor overlay for YouTube

const MIN_CLIP_SECONDS = 3;

class ClipEditor {
  /** @type {HTMLElement | null} */
  #root = null;
  /** @type {HTMLVideoElement | null} */
  #video = null;
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
    this.#duration = video.duration;
    if (!Number.isFinite(this.#duration) || this.#duration <= 0) return;

    const current = video.currentTime;
    const length = Math.min(defaultDuration, this.#duration);
    this.#clipEnd = current;
    this.#clipStart = Math.max(0, current - length);

    const normalized = normalizeClip(this.#clipStart, this.#clipEnd, this.#duration, MIN_CLIP_SECONDS);
    this.#clipStart = normalized.start;
    this.#clipEnd = normalized.end;

    video.pause();
    this.#mount();
    this.#bindLayout();
    this.#render();
  }

  close() {
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

    this.#root?.remove();
    this.#root = null;
    this.#video = null;
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

      <div class="clippy-panel" data-panel role="dialog" aria-label="Éditeur de clip">
        <div class="clippy-panel-row">
          <div class="clippy-timeline" data-timeline>
            <div class="clippy-track" data-track>
              <div class="clippy-region" data-region>
                <div class="clippy-handle clippy-handle-left" data-handle="left" aria-label="Début du clip"></div>
                <div class="clippy-handle clippy-handle-right" data-handle="right" aria-label="Fin du clip"></div>
              </div>
              <div class="clippy-playhead" data-playhead aria-label="Position actuelle">
                <div class="clippy-playhead-knob"></div>
              </div>
            </div>
          </div>
          <div class="clippy-toolbar">
            <button type="button" class="clippy-icon-action" data-action="close" aria-label="Fermer">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.89 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"/>
              </svg>
            </button>
            <button type="button" class="clippy-icon-action clippy-icon-action-save" data-action="save" aria-label="Sauver">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path fill="currentColor" d="M8 12.2 13.1 5.4 3.4 5.9 8 12.2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    this.#root = root;

    root.querySelectorAll('[data-action="close"]').forEach((el) => {
      el.addEventListener('click', () => this.close());
    });

    root.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      this.#onSave?.({ start: this.#clipStart, end: this.#clipEnd });
      this.close();
    });

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
    if (player) {
      this.#layoutObserver = new ResizeObserver(this.#onLayoutChange);
      this.#layoutObserver.observe(player);
    }

    if (this.#video) {
      this.#layoutObserver?.observe(this.#video);
    }
  }

  #updateLayout() {
    if (!this.#root) return;

    const playerRect = this.#getPlayerRect();
    const videoRect = this.#getVideoRect();
    const frame = this.#root.querySelector('[data-video-frame]');
    const panel = this.#root.querySelector('[data-panel]');
    const shades = {
      top: this.#root.querySelector('[data-shade="top"]'),
      left: this.#root.querySelector('[data-shade="left"]'),
      right: this.#root.querySelector('[data-shade="right"]'),
      bottom: this.#root.querySelector('[data-shade="bottom"]'),
    };

    if (!playerRect || !videoRect || !(frame instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const isFullscreen = Boolean(document.fullscreenElement);

    const holeTop = videoRect.top;
    const holeLeft = videoRect.left;
    const holeRight = videoRect.right;
    const holeBottom = videoRect.bottom;

    if (shades.top instanceof HTMLElement) {
      shades.top.style.cssText = `top:0;left:0;width:${viewportW}px;height:${Math.max(0, holeTop)}px`;
    }
    if (shades.left instanceof HTMLElement) {
      shades.left.style.cssText = `top:${holeTop}px;left:0;width:${Math.max(0, holeLeft)}px;height:${videoRect.height}px`;
    }
    if (shades.right instanceof HTMLElement) {
      shades.right.style.cssText = `top:${holeTop}px;left:${holeRight}px;width:${Math.max(0, viewportW - holeRight)}px;height:${videoRect.height}px`;
    }
    if (shades.bottom instanceof HTMLElement) {
      shades.bottom.style.cssText = `top:${holeBottom}px;left:0;width:${viewportW}px;height:${Math.max(0, viewportH - holeBottom)}px`;
    }

    frame.style.top = `${videoRect.top}px`;
    frame.style.left = `${videoRect.left}px`;
    frame.style.width = `${videoRect.width}px`;
    frame.style.height = `${videoRect.height}px`;

    const panelWidth = playerRect.width;
    const panelLeft = playerRect.left;
    const panelGap = 8;
    const panelHeight = panel.offsetHeight || 68;

    let panelTop = playerRect.bottom + panelGap;
    if (isFullscreen) {
      panelTop = viewportH - panelHeight - panelGap;
    }

    panel.style.width = `${panelWidth}px`;
    panel.style.left = `${panelLeft}px`;
    panel.style.top = `${panelTop}px`;
  }

  #bindPlayback() {
    if (!this.#video) return;

    this.#onTimeUpdate = () => {
      this.#render();
    };

    this.#video.addEventListener('timeupdate', this.#onTimeUpdate);
    this.#video.addEventListener('seeked', this.#onTimeUpdate);
  }

  #bindKeys() {
    this.#onKeyDown = (e) => {
      if (!this.isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.close();
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.#togglePlay();
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
      mode = nextMode;
      pointerId = e.pointerId;
      originX = e.clientX;
      originStart = this.#clipStart;
      originEnd = this.#clipEnd;
      e.currentTarget?.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
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
        this.#seekTo(timeAt(e.clientX));
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
      } else if (mode === 'left') {
        const end = originEnd;
        const start = clamp(originStart + delta, 0, end - MIN_CLIP_SECONDS);
        this.#clipStart = start;
        this.#clipEnd = end;
        this.#seekTo(start);
      } else if (mode === 'right') {
        const start = originStart;
        const end = clamp(originEnd + delta, start + MIN_CLIP_SECONDS, this.#duration);
        this.#clipStart = start;
        this.#clipEnd = end;
        this.#seekTo(end);
      }

      this.#render();
    };

    const onPointerUp = (e) => {
      if (e.pointerId !== pointerId) return;
      mode = null;
      pointerId = null;
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

  #render() {
    if (!this.#root || !this.#video) return;

    const pct = (t) => `${(t / this.#duration) * 100}%`;
    const region = this.#root.querySelector('[data-region]');
    const playhead = this.#root.querySelector('[data-playhead]');
    const videoFrame = this.#root.querySelector('[data-video-frame]');

    const currentTime = this.#video.currentTime;
    const inClip = isTimeInClip(currentTime, this.#clipStart, this.#clipEnd);

    if (region instanceof HTMLElement) {
      region.style.left = pct(this.#clipStart);
      region.style.width = pct(this.#clipEnd - this.#clipStart);
    }

    if (playhead instanceof HTMLElement) {
      playhead.style.left = pct(currentTime);
    }

    if (videoFrame instanceof HTMLElement) {
      videoFrame.classList.toggle('clippy-video-frame--in-clip', inClip);
    }
  }
}

window.ClipEditor = ClipEditor;
