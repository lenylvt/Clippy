// Clip editor — orchestration only (open / close / wire modules)

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
  /** @type {(() => void) | null} */
  #unbindPlayback = null;
  /** @type {(() => void) | null} */
  #unbindKeys = null;
  /** @type {(() => void) | null} */
  #onLayoutChange = null;
  /** @type {(() => void) | null} */
  #onFullscreenChange = null;
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
    requestAnimationFrame(() => this.#scheduleLayout());
    this.#startFilmstrip();
  }

  close() {
    this.#filmstripAbort?.abort();
    this.#filmstripAbort = null;
    this.#filmstripToken += 1;
    cancelAnimationFrame(this.#previewRaf);

    this.#unbindPlayback?.();
    this.#unbindPlayback = null;
    this.#unbindKeys?.();
    this.#unbindKeys = null;

    if (this.#onLayoutChange) {
      window.removeEventListener('resize', this.#onLayoutChange);
      window.removeEventListener('scroll', this.#onLayoutChange, true);
    }

    if (this.#onFullscreenChange) {
      document.removeEventListener('fullscreenchange', this.#onFullscreenChange);
    }

    cancelAnimationFrame(this.#layoutRaf);
    this.#layoutObserver?.disconnect();
    this.#layoutObserver = null;
    this.#onLayoutChange = null;
    this.#onFullscreenChange = null;
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

  #scheduleLayout() {
    cancelAnimationFrame(this.#layoutRaf);
    this.#layoutRaf = requestAnimationFrame(() => {
      if (!this.#root) return;
      syncEditorOverlayParent(this.#root);
      const anchorRect = getYoutubePlayerRect(this.#video) ?? getYoutubeVideoRect(this.#video);
      if (anchorRect) applyEditorOverlayLayout(this.#root, anchorRect);
    });
  }

  #mount() {
    const root = document.createElement('div');
    root.className = 'clippy-overlay';
    root.innerHTML = createEditorOverlayHtml();

    document.body.appendChild(root);
    this.#root = root;

    root.querySelectorAll('[data-action="close"]').forEach((el) => {
      el.addEventListener('click', () => this.close());
    });

    root.querySelector('[data-action="save"]')?.addEventListener('click', () => this.#triggerSave());

    bindEditorTimeline(root.querySelector('[data-timeline]'), this.#timelineApi());
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

    const player = getYoutubePlayerElement(this.#video);
    this.#layoutObserver = new ResizeObserver(this.#onLayoutChange);
    if (player) this.#layoutObserver.observe(player);
    if (this.#video) this.#layoutObserver.observe(this.#video);
  }

  #bindPlayback() {
    if (!this.#video) return;
    this.#unbindPlayback = bindEditorPlayback(this.#video, () => {
      this.#render();
      if (this.#dragMode === 'left' || this.#dragMode === 'right' || this.#dragMode === 'playhead') {
        this.#updateFramePreview();
      }
    });
  }

  #bindKeys() {
    this.#unbindKeys = bindEditorKeys(this.#keysApi());
  }

  #seekTo(time) {
    if (this.#video) seekEditorVideo(this.#video, this.#duration, time);
  }

  #togglePlay() {
    if (this.#video) toggleEditorPlayback(this.#video);
  }

  /**
   * @param {number} time
   * @param {'left' | 'right' | null} handle
   */
  #showFramePreviewAt(time, handle) {
    if (!this.#root || !this.#video) return;
    showEditorFramePreview({
      root: this.#root,
      video: this.#video,
      duration: this.#duration,
      time,
      handle,
      schedulePaint: (canvas) => {
        cancelAnimationFrame(this.#previewRaf);
        this.#previewRaf = requestAnimationFrame(() => {
          if (this.#video) paintEditorPreviewCanvas(this.#video, canvas);
        });
      },
    });
  }

  #updateFramePreview() {
    if (!this.#root || !this.#video) return;
    updateEditorFramePreview({
      root: this.#root,
      video: this.#video,
      clipStart: this.#clipStart,
      clipEnd: this.#clipEnd,
      dragMode: this.#dragMode,
      showAt: (t, h) => this.#showFramePreviewAt(t, h),
    });
  }

  #hideFramePreview() {
    hideEditorFramePreview(this.#root);
  }

  async #startFilmstrip() {
    if (!this.#root || !this.#video) return;
    const strip = this.#root.querySelector('[data-filmstrip]');
    if (!(strip instanceof HTMLElement)) return;

    this.#filmstripAbort?.abort();
    const ac = new AbortController();
    this.#filmstripAbort = ac;
    const token = ++this.#filmstripToken;
    const video = this.#video;

    await generateEditorFilmstrip({
      strip,
      video,
      videoId: this.#videoId,
      duration: this.#duration,
      signal: ac.signal,
      isCurrent: () => token === this.#filmstripToken && this.isOpen && this.#video === video,
    });
  }

  #render() {
    if (!this.#root || !this.#video) return;
    renderEditorPanel({
      root: this.#root,
      video: this.#video,
      duration: this.#duration,
      clipStart: this.#clipStart,
      clipEnd: this.#clipEnd,
    });
  }

  #keysApi() {
    return {
      isOpen: () => this.isOpen,
      close: () => this.close(),
      triggerSave: () => this.#triggerSave(),
      togglePlay: () => this.#togglePlay(),
      getClipStart: () => this.#clipStart,
      setClipStart: (v) => {
        this.#clipStart = v;
      },
      getClipEnd: () => this.#clipEnd,
      setClipEnd: (v) => {
        this.#clipEnd = v;
      },
      getDuration: () => this.#duration,
      getVideo: () => this.#video,
      seekTo: (t) => this.#seekTo(t),
      render: () => this.#render(),
      showFramePreviewAt: (time, handle) => this.#showFramePreviewAt(time, handle),
    };
  }

  #timelineApi() {
    return {
      getDuration: () => this.#duration,
      getClipStart: () => this.#clipStart,
      getClipEnd: () => this.#clipEnd,
      setClipStart: (v) => {
        this.#clipStart = v;
      },
      setClipEnd: (v) => {
        this.#clipEnd = v;
      },
      setDragMode: (mode) => {
        this.#dragMode = mode;
      },
      abortFilmstrip: () => this.#filmstripAbort?.abort(),
      seekTo: (t) => this.#seekTo(t),
      render: () => this.#render(),
      showFramePreviewAt: (time, handle) => this.#showFramePreviewAt(time, handle),
      hideFramePreview: () => this.#hideFramePreview(),
    };
  }
}

window.ClipEditor = ClipEditor;
