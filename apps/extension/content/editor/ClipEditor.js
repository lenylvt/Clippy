// Clip editor — multi-clip regions, filmstrip, playback & keys

/** @typedef {{ id: string; start: number; end: number; colorIndex: number }} EditorDraftClip */

class ClipEditor {
  /** @type {HTMLElement | null} */
  #root = null;
  /** @type {HTMLVideoElement | null} */
  #video = null;
  #videoId = '';
  #duration = 0;
  /** @type {EditorDraftClip[]} */
  #clips = [];
  /** @type {string | null} */
  #activeId = null;
  #defaultLength = 90;
  /** Time to restore on close / filmstrip end (user playhead). */
  #restoreTime = 0;
  /** @type {((clips: { start: number; end: number }[]) => void | Promise<void>) | null} */
  #onSave = null;
  /** @type {(() => void) | null} */
  #unbindPlayback = null;
  /** @type {(() => void) | null} */
  #unbindKeys = null;
  /** @type {(() => void) | null} */
  #unbindTimeline = null;
  /** @type {(() => void) | null} */
  #onLayoutChange = null;
  /** @type {(() => void) | null} */
  #onFullscreenChange = null;
  /** @type {ResizeObserver | null} */
  #layoutObserver = null;
  /** @type {MutationObserver | null} */
  #playerAttrObserver = null;
  #layoutRaf = 0;
  #renderRaf = 0;
  #saving = false;
  /** @type {AbortController | null} */
  #filmstripAbort = null;
  #filmstripSkipRestore = false;
  #filmstripBusy = false;
  /** @type {'left' | 'right' | 'move' | 'playhead' | null} */
  #dragMode = null;
  #filmstripToken = 0;
  /** @type {ReturnType<typeof captureEditorRenderRefs> | null} */
  #refs = null;
  /** @type {HTMLElement | null} */
  #previousFocus = null;
  #reducedMotion = false;

  /**
   * @param {{
   *   onSave?: (clips: { start: number; end: number }[]) => void | Promise<void>;
   * }} [options]
   */
  constructor(options = {}) {
    this.#onSave = options.onSave ?? null;
  }

  get isOpen() {
    return Boolean(this.#root);
  }

  /** @returns {EditorDraftClip | null} */
  #activeClip() {
    return this.#clips.find((c) => c.id === this.#activeId) ?? this.#clips[0] ?? null;
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {number} defaultDuration seconds
   */
  open(video, defaultDuration) {
    if (this.isOpen) {
      this.close();
    }

    this.#video = video;
    this.#videoId = getYoutubeVideoId(window.location.href) || '';
    this.#duration = video.duration;
    if (!Number.isFinite(this.#duration) || this.#duration <= 0) {
      this.#video = null;
      showStatusBadge?.('Vidéo non prête', { variant: 'error' });
      clippyLog('editor', 'open:invalid_duration');
      return;
    }

    this.#reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    this.#previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const current = video.currentTime;
    this.#restoreTime = current;
    const maxLen = editorMaxClipLength(this.#duration);
    this.#defaultLength = Math.min(defaultDuration, maxLen, this.#duration);
    const range = rangeAroundTime(current, this.#defaultLength, this.#duration);
    const normalized = normalizeClip(
      range.start,
      range.end,
      this.#duration,
      editorMinClipLength(this.#duration),
      maxLen,
    );

    const first = createEditorClip({
      start: normalized.start,
      end: normalized.end,
      colorIndex: 0,
    });
    this.#clips = [first];
    this.#activeId = first.id;

    video.pause();
    this.#mount();
    this.#bindLayout();
    this.#scheduleRender();
    requestAnimationFrame(() => this.#scheduleLayout());
    this.#startFilmstrip();
  }

  close() {
    const video = this.#video;
    const restoreTime = this.#restoreTime;

    this.#filmstripSkipRestore = false;
    this.#filmstripAbort?.abort();
    this.#filmstripAbort = null;
    this.#filmstripToken += 1;
    this.#filmstripBusy = false;

    if (this.#layoutRaf) {
      cancelAnimationFrame(this.#layoutRaf);
      this.#layoutRaf = 0;
    }
    if (this.#renderRaf) {
      cancelAnimationFrame(this.#renderRaf);
      this.#renderRaf = 0;
    }

    this.#unbindTimeline?.();
    this.#unbindTimeline = null;
    this.#unbindPlayback?.();
    this.#unbindPlayback = null;
    this.#unbindKeys?.();
    this.#unbindKeys = null;

    if (this.#onLayoutChange) {
      window.removeEventListener('resize', this.#onLayoutChange);
      window.removeEventListener('scroll', this.#onLayoutChange, true);
      window.visualViewport?.removeEventListener('resize', this.#onLayoutChange);
      window.visualViewport?.removeEventListener('scroll', this.#onLayoutChange);
    }

    if (this.#onFullscreenChange) {
      document.removeEventListener('fullscreenchange', this.#onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', this.#onFullscreenChange);
    }

    this.#layoutObserver?.disconnect();
    this.#layoutObserver = null;
    this.#playerAttrObserver?.disconnect();
    this.#playerAttrObserver = null;
    this.#onLayoutChange = null;
    this.#onFullscreenChange = null;
    this.#dragMode = null;
    this.#refs = null;
    this.#clips = [];
    this.#activeId = null;

    this.#root?.remove();
    this.#root = null;

    if (video) {
      try {
        if (Number.isFinite(restoreTime)) video.currentTime = restoreTime;
        video.pause();
      } catch {
        /* ignore */
      }
    }

    this.#video = null;
    this.#videoId = '';
    this.#duration = 0;
    this.#restoreTime = 0;

    const focusEl = this.#previousFocus;
    this.#previousFocus = null;
    if (focusEl?.isConnected) {
      try {
        focusEl.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Double-clic : add editable colored region (no download).
   * @param {number} atTime
   */
  addClipAt(atTime) {
    if (!this.isOpen) return;
    const max = globalThis.EDITOR_CLIP_MAX ?? 8;
    if (this.#clips.length >= max) {
      showStatusBadge?.(`Maximum ${max} clips`, { variant: 'error' });
      return;
    }

    const range = rangeAroundTime(atTime, this.#defaultLength, this.#duration);
    const normalized = normalizeClip(
      range.start,
      range.end,
      this.#duration,
      editorMinClipLength(this.#duration),
      editorMaxClipLength(this.#duration),
    );
    const clip = createEditorClip({
      start: normalized.start,
      end: normalized.end,
      colorIndex: nextEditorClipColorIndex(this.#clips),
    });
    this.#clips.push(clip);
    this.#activeId = clip.id;
    this.#seekTo(clip.start);
    clippyLog('editor', 'clip:add', { id: clip.id, n: this.#clips.length });
    this.#scheduleRender();
  }

  removeActiveClip() {
    if (this.#clips.length <= 1) {
      showStatusBadge?.('Garde au moins un clip', { variant: 'default' });
      return;
    }
    const id = this.#activeId;
    this.#clips = this.#clips.filter((c) => c.id !== id);
    this.#activeId = this.#clips[this.#clips.length - 1]?.id ?? null;
    this.#scheduleRender();
  }

  #triggerSave() {
    if (this.#saving) {
      clippyLog('editor', 'save:ignored_busy');
      return;
    }

    const maxLen = editorMaxClipLength(this.#duration);
    const minLen = editorMinClipLength(this.#duration);
    /** @type {{ start: number; end: number }[]} */
    const payload = [];

    for (const clip of this.#clips) {
      if (clip.end - clip.start > maxLen + 0.01) {
        showStatusBadge?.(`Clip trop long (max ${formatDuration(maxLen)})`, { variant: 'error' });
        this.#activeId = clip.id;
        this.#scheduleRender();
        return;
      }
      if (clip.end - clip.start < minLen - 0.01) {
        showStatusBadge?.('Clip trop court', { variant: 'error' });
        this.#activeId = clip.id;
        this.#scheduleRender();
        return;
      }
      payload.push({ start: clip.start, end: clip.end });
    }

    if (payload.length === 0) {
      showStatusBadge?.('Aucun clip', { variant: 'error' });
      return;
    }

    clippyLog('editor', 'save:launch', { n: payload.length });
    this.#saving = true;
    const saveBtn = this.#refs?.saveBtn;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.setAttribute('aria-busy', 'true');
    }

    this.close();
    Promise.resolve(this.#onSave?.(payload))
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        showStatusBadge?.(message === 'pairing_required' ? 'Relie l’app (réglages → QR)' : 'Échec du clip', {
          variant: 'error',
        });
        clippyLog('editor', 'save:fail', { error: message });
      })
      .finally(() => {
        this.#saving = false;
      });
  }

  #scheduleLayout() {
    cancelAnimationFrame(this.#layoutRaf);
    this.#layoutRaf = requestAnimationFrame(() => {
      this.#layoutRaf = 0;
      if (!this.#root) return;
      syncEditorOverlayParent(this.#root);
      const anchorRect = getYoutubeVideoRect(this.#video) ?? getYoutubePlayerRect(this.#video);
      if (anchorRect) applyEditorOverlayLayout(this.#root, anchorRect);
    });
  }

  #scheduleRender() {
    if (this.#renderRaf) return;
    this.#renderRaf = requestAnimationFrame(() => {
      this.#renderRaf = 0;
      this.#renderNow();
    });
  }

  #mount() {
    const root = document.createElement('div');
    root.className = 'clippy-overlay';
    if (this.#reducedMotion) root.classList.add('clippy-overlay--reduced-motion');
    root.innerHTML = createEditorOverlayHtml();

    document.body.appendChild(root);
    this.#root = root;
    this.#refs = captureEditorRenderRefs(root);

    root.addEventListener('click', (e) => {
      const actionEl = e.target instanceof Element ? e.target.closest('[data-action]') : null;
      if (!(actionEl instanceof HTMLElement)) return;
      const action = actionEl.dataset.action;
      if (action === 'close') this.close();
      else if (action === 'save') this.#triggerSave();
    });

    this.#unbindTimeline = bindEditorTimeline(root.querySelector('[data-timeline]'), this.#timelineApi()) ?? null;
    this.#bindPlayback();
    this.#bindKeys();

    const panel = this.#refs.panel;
    if (panel) {
      try {
        panel.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
  }

  #bindLayout() {
    this.#onLayoutChange = () => this.#scheduleLayout();
    this.#onFullscreenChange = () => this.#scheduleLayout();

    this.#scheduleLayout();

    window.addEventListener('resize', this.#onLayoutChange, { passive: true });
    window.addEventListener('scroll', this.#onLayoutChange, { passive: true, capture: true });
    window.visualViewport?.addEventListener('resize', this.#onLayoutChange, { passive: true });
    window.visualViewport?.addEventListener('scroll', this.#onLayoutChange, { passive: true });
    document.addEventListener('fullscreenchange', this.#onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', this.#onFullscreenChange);

    const player = getYoutubePlayerElement(this.#video);
    this.#layoutObserver = new ResizeObserver(this.#onLayoutChange);
    if (player) {
      this.#layoutObserver.observe(player);
      this.#playerAttrObserver = new MutationObserver(this.#onLayoutChange);
      this.#playerAttrObserver.observe(player, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    if (this.#video) this.#layoutObserver.observe(this.#video);
  }

  #bindPlayback() {
    if (!this.#video) return;
    this.#unbindPlayback = bindEditorPlayback(this.#video, () => {
      if (this.#filmstripBusy) return;
      this.#scheduleRender();
    });
  }

  #bindKeys() {
    this.#unbindKeys = bindEditorKeys(this.#keysApi());
  }

  #seekTo(time) {
    if (!this.#video) return;
    seekEditorVideo(this.#video, this.#duration, time);
    this.#restoreTime = this.#video.currentTime;
  }

  #togglePlay() {
    if (!this.#video) return;
    toggleEditorPlayback(this.#video);
  }

  async #startFilmstrip() {
    if (!this.#root || !this.#video) return;
    const strip = this.#root.querySelector('[data-filmstrip]');
    if (!(strip instanceof HTMLElement)) return;

    if (typeof tryPaintFilmstripCache === 'function' && tryPaintFilmstripCache(strip, this.#videoId)) {
      return;
    }

    this.#filmstripAbort?.abort();
    this.#filmstripSkipRestore = false;
    const ac = new AbortController();
    this.#filmstripAbort = ac;
    const token = ++this.#filmstripToken;
    const video = this.#video;

    try {
      await generateEditorFilmstrip({
        strip,
        video,
        videoId: this.#videoId,
        duration: this.#duration,
        signal: ac.signal,
        isCurrent: () => token === this.#filmstripToken && this.isOpen && this.#video === video,
        skipRestore: () => this.#filmstripSkipRestore,
        onBusyChange: (busy) => {
          this.#filmstripBusy = busy;
        },
      });
    } catch (err) {
      clippyLog('editor', 'filmstrip:error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  #ensureFilmstrip() {
    if (!this.isOpen || !this.#root || !this.#video) return;
    const strip = this.#root.querySelector('[data-filmstrip]');
    if (!(strip instanceof HTMLElement)) return;

    const count = globalThis.CLIPPY_FILMSTRIP_COUNT ?? 10;
    if (typeof filmstripIsComplete === 'function' && filmstripIsComplete(strip, count)) {
      return;
    }
    if (typeof tryPaintFilmstripCache === 'function' && tryPaintFilmstripCache(strip, this.#videoId, count)) {
      return;
    }
    void this.#startFilmstrip();
  }

  #renderNow() {
    if (!this.#root || !this.#video) return;
    renderEditorPanel({
      root: this.#root,
      refs: this.#refs,
      video: this.#video,
      duration: this.#duration,
      clips: this.#clips,
      activeId: this.#activeId,
    });
  }

  #sessionApi() {
    return {
      isOpen: () => this.isOpen,
      close: () => this.close(),
      triggerSave: () => this.#triggerSave(),
      togglePlay: () => this.#togglePlay(),
      removeActiveClip: () => this.removeActiveClip(),
      getClips: () => this.#clips.slice(),
      getActiveId: () => this.#activeId,
      setActiveId: (id) => {
        if (this.#clips.some((c) => c.id === id)) {
          this.#activeId = id;
        }
      },
      getClipStart: () => this.#activeClip()?.start ?? 0,
      setClipStart: (v) => {
        const clip = this.#activeClip();
        if (clip) clip.start = v;
      },
      getClipEnd: () => this.#activeClip()?.end ?? 0,
      setClipEnd: (v) => {
        const clip = this.#activeClip();
        if (clip) clip.end = v;
      },
      getDuration: () => this.#duration,
      getVideo: () => this.#video,
      seekTo: (t) => this.#seekTo(t),
      render: () => this.#scheduleRender(),
      addClipAt: (t) => this.addClipAt(t),
      setDragMode: (mode) => {
        this.#dragMode = mode;
      },
      isFilmstripBusy: () => this.#filmstripBusy,
      abortFilmstrip: (opts = {}) => {
        this.#filmstripSkipRestore = opts.skipRestore === true;
        this.#filmstripAbort?.abort();
      },
      ensureFilmstrip: () => this.#ensureFilmstrip(),
      restartFilmstrip: () => this.#ensureFilmstrip(),
    };
  }

  #keysApi() {
    return this.#sessionApi();
  }

  #timelineApi() {
    return this.#sessionApi();
  }
}

globalThis.ClipEditor = ClipEditor;
