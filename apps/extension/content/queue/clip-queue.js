/**
 * Multi-clip queue + discreet progress dock under the YouTube player.
 *
 * Mount targets (in order):
 *  - #below (classic watch page)
 *  - #primary-inner
 *  - after #player (insertAdjacentElement afterend on #player itself)
 */

/** @typedef {'queued' | 'preparing' | 'download' | 'crop' | 'upload' | 'done' | 'error'} ClipQueueStatus */

/** @typedef {{
 *   id: string;
 *   start: number;
 *   end: number;
 *   status: ClipQueueStatus;
 *   label: string;
 *   progress: number;
 *   error?: string;
 *   thumbUrl?: string;
 *   url?: string;
 * }} ClipQueueJob */

const QUEUE_STATUSES = new Set([
  'queued',
  'preparing',
  'download',
  'crop',
  'upload',
  'done',
  'error',
]);

const DISMISS_MS_DONE = 12_000;
const DISMISS_MS_ERROR = 10_000;

/**
 * @param {unknown} status
 * @returns {status is ClipQueueStatus}
 */
function isQueueStatus(status) {
  return typeof status === 'string' && QUEUE_STATUSES.has(status);
}

/**
 * @param {unknown} url
 * @returns {boolean}
 */
function isSafeThumbUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  if (url.startsWith('data:image/')) {
    return /^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(url);
  }
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * @param {unknown} url
 * @returns {boolean}
 */
function isSafeLinkUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') return true;
    if (
      u.protocol === 'http:' &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function clampProgress(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * @param {ClipQueueStatus} status
 * @param {number} progress
 */
function queueBarWidth(status, progress) {
  const busy = status !== 'done' && status !== 'error';
  const pct = Math.round(clampProgress(progress) * 100);
  if (!busy) return 100;
  return Math.max(pct, status === 'queued' ? 4 : 8);
}

class ClipQueue {
  /** @type {ClipQueueJob[]} */
  #jobs = [];
  /** @type {HTMLElement | null} */
  #root = null;
  /** @type {HTMLElement | null} */
  #inner = null;
  /** @type {MutationObserver | null} */
  #mountObserver = null;
  /** @type {string | null} */
  #globalStatus = null;
  /** @type {'default' | 'error'} */
  #globalVariant = 'default';
  #globalClearTimer = 0;
  /** @type {Map<string, number>} */
  #dismissTimers = new Map();
  #navBound = false;
  /** @type {string | null} */
  #hoverJobId = null;

  /** @returns {ClipQueueJob[]} */
  get jobs() {
    return this.#jobs.slice();
  }

  /**
   * @param {{ start: number; end: number; thumbUrl?: string }} clip
   * @returns {ClipQueueJob}
   */
  enqueue(clip) {
    const start = Number(clip.start);
    const end = Number(clip.end);
    const safeStart = Number.isFinite(start) ? Math.max(0, start) : 0;
    const safeEnd = Number.isFinite(end) && end > safeStart ? end : safeStart;
    const thumbUrl = isSafeThumbUrl(clip.thumbUrl) ? clip.thumbUrl : undefined;

    /** @type {ClipQueueJob} */
    const job = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `job_${crypto.randomUUID()}`
          : `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
      start: safeStart,
      end: safeEnd,
      status: 'queued',
      label: 'En attente',
      progress: 0,
      thumbUrl,
    };
    this.#jobs.unshift(job);
    this.#ensureMounted();
    this.#bindNavigation();
    this.#render();
    return job;
  }

  /**
   * @param {string} jobId
   * @param {{
   *   status?: ClipQueueStatus;
   *   label?: string;
   *   progress?: number;
   *   error?: string | null;
   *   url?: string | null;
   * }} patch
   */
  update(jobId, patch) {
    const job = this.#jobs.find((j) => j.id === jobId);
    if (!job) return;

    if (isQueueStatus(patch.status)) job.status = patch.status;
    if (typeof patch.label === 'string') job.label = patch.label;
    if (typeof patch.progress === 'number') job.progress = clampProgress(patch.progress);

    if ('error' in patch) {
      job.error = patch.error ? String(patch.error) : undefined;
    }
    if ('url' in patch) {
      job.url = isSafeLinkUrl(patch.url) ? /** @type {string} */ (patch.url) : undefined;
    }
    if (job.status !== 'done') {
      job.url = undefined;
    }

    if (!this.#patchJobRow(job)) this.#render();

    if (job.status === 'done' || job.status === 'error') {
      this.#scheduleDismiss(jobId, job.status === 'done' ? DISMISS_MS_DONE : DISMISS_MS_ERROR);
    } else {
      this.#clearDismiss(jobId);
    }
  }

  /** Vide la file (navigation SPA YouTube). */
  clear() {
    for (const timer of this.#dismissTimers.values()) window.clearTimeout(timer);
    this.#dismissTimers.clear();
    this.#jobs = [];
    this.#globalStatus = null;
    window.clearTimeout(this.#globalClearTimer);
    this.#globalClearTimer = 0;
    this.#hoverJobId = null;
    this.#unmount();
  }

  /** @param {string} jobId */
  #clearDismiss(jobId) {
    const prev = this.#dismissTimers.get(jobId);
    if (prev) window.clearTimeout(prev);
    this.#dismissTimers.delete(jobId);
  }

  /**
   * @param {string} jobId
   * @param {number} ms
   */
  #scheduleDismiss(jobId, ms) {
    this.#clearDismiss(jobId);
    const timer = window.setTimeout(() => {
      this.#dismissTimers.delete(jobId);
      if (this.#hoverJobId === jobId) {
        this.#scheduleDismiss(jobId, 4000);
        return;
      }
      this.#removeJob(jobId);
    }, ms);
    this.#dismissTimers.set(jobId, timer);
  }

  /** @param {string} jobId */
  #removeJob(jobId) {
    this.#clearDismiss(jobId);
    this.#jobs = this.#jobs.filter((j) => j.id !== jobId);
    const row = this.#inner?.querySelector(`[data-job-id="${CSS.escape(jobId)}"]`);
    row?.remove();
    if (this.#jobs.length === 0 && !this.#globalStatus) {
      this.#unmount();
      return;
    }
    this.#render();
  }

  /**
   * Global line (prefetch / one-off) — discrete, under the player.
   * @param {string} label
   * @param {{ variant?: 'default' | 'error'; sticky?: boolean }} [options]
   */
  setGlobalStatus(label, options = {}) {
    this.#globalStatus = label;
    this.#globalVariant = options.variant === 'error' ? 'error' : 'default';
    window.clearTimeout(this.#globalClearTimer);
    this.#ensureMounted();
    this.#bindNavigation();
    this.#render();

    if (!options.sticky) {
      const ms = options.variant === 'error' ? 4500 : 2200;
      this.#globalClearTimer = window.setTimeout(() => {
        this.#globalStatus = null;
        this.#render();
        if (this.#jobs.length === 0) this.#unmount();
      }, ms);
    }
  }

  clearGlobalStatus() {
    this.#globalStatus = null;
    window.clearTimeout(this.#globalClearTimer);
    this.#globalClearTimer = 0;
    this.#render();
    if (this.#jobs.length === 0) this.#unmount();
  }

  #bindNavigation() {
    if (this.#navBound) return;
    this.#navBound = true;
    const onNav = () => this.clear();
    document.addEventListener('yt-navigate-start', onNav);
    document.addEventListener('yt-navigate-finish', onNav);
  }

  /** @returns {HTMLElement | null} */
  #findMountHost() {
    const below = document.querySelector('#below');
    if (below instanceof HTMLElement) return below;

    const primaryInner = document.querySelector('#primary-inner');
    if (primaryInner instanceof HTMLElement) return primaryInner;

    const player = document.querySelector('#player');
    if (player instanceof HTMLElement) return player;

    return null;
  }

  /**
   * @param {HTMLElement} host
   * @param {HTMLElement} root
   */
  #attachRoot(host, root) {
    if (host.id === 'below' || host.id === 'primary-inner') {
      host.prepend(root);
    } else if (host.id === 'player') {
      host.insertAdjacentElement('afterend', root);
    } else {
      host.insertAdjacentElement('afterend', root);
    }
  }

  #ensureMounted() {
    if (this.#root?.isConnected) return;

    if (!this.#root) {
      const root = document.createElement('div');
      root.className = 'clippy-queue';
      root.setAttribute('data-clippy-queue', '1');
      this.#root = root;
    }

    const host = this.#findMountHost();
    if (host) {
      this.#attachRoot(host, this.#root);
    } else {
      document.body.appendChild(this.#root);
    }

    if (!this.#mountObserver) {
      this.#mountObserver = new MutationObserver(() => {
        if (!this.#root) return;
        if (this.#root.isConnected) return;
        const nextHost = this.#findMountHost();
        if (nextHost) this.#attachRoot(nextHost, this.#root);
      });
      this.#mountObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  #unmount() {
    this.#mountObserver?.disconnect();
    this.#mountObserver = null;
    this.#root?.remove();
    this.#root = null;
    this.#inner = null;
  }

  /**
   * @param {HTMLElement} row
   * @param {ClipQueueJob} job
   */
  #syncLink(row, job) {
    let link = row.querySelector('.clippy-queue-link');
    const safeUrl = job.status === 'done' && job.url && isSafeLinkUrl(job.url) ? job.url : null;
    if (safeUrl) {
      if (!(link instanceof HTMLAnchorElement)) {
        link = document.createElement('a');
        link.className = 'clippy-queue-link';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Ouvrir';
        link.setAttribute('aria-label', 'Ouvrir le clip (nouvel onglet)');
        row.querySelector('.clippy-queue-row')?.appendChild(link);
      }
      /** @type {HTMLAnchorElement} */ (link).href = safeUrl;
      link.rel = 'noopener noreferrer';
    } else if (link) {
      link.remove();
    }
  }

  /**
   * @param {HTMLElement} row
   * @param {ClipQueueJob} job
   */
  #syncDismiss(row, job) {
    let btn = row.querySelector('.clippy-queue-dismiss');
    const show = job.status === 'done' || job.status === 'error';
    if (show) {
      if (!(btn instanceof HTMLButtonElement)) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'clippy-queue-dismiss';
        btn.setAttribute('aria-label', 'Fermer');
        btn.textContent = '×';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.#removeJob(job.id);
        });
        row.querySelector('.clippy-queue-row')?.appendChild(btn);
      }
    } else if (btn) {
      btn.remove();
    }
  }

  /**
   * @param {HTMLElement} row
   * @param {ClipQueueJob} job
   */
  #syncOptionsHint(row, job) {
    let hint = row.querySelector('.clippy-queue-options');
    const need =
      job.status === 'error' &&
      (job.error === 'pairing_required' || /relie/i.test(job.label));
    if (need) {
      if (!(hint instanceof HTMLButtonElement)) {
        hint = document.createElement('button');
        hint.type = 'button';
        hint.className = 'clippy-queue-options';
        hint.textContent = 'Réglages';
        hint.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            chrome.runtime.openOptionsPage();
          } catch {
            /* ignore */
          }
        });
        row.querySelector('.clippy-queue-row')?.appendChild(hint);
      }
    } else if (hint) {
      hint.remove();
    }
  }

  /**
   * Patch an existing row in place so the progress bar can animate.
   * @param {ClipQueueJob} job
   * @returns {boolean}
   */
  #patchJobRow(job) {
    if (!this.#inner) return false;
    const row = this.#inner.querySelector(`[data-job-id="${CSS.escape(job.id)}"]`);
    if (!(row instanceof HTMLElement)) return false;

    const busy = job.status !== 'done' && job.status !== 'error';
    const pct = Math.round(clampProgress(job.progress) * 100);
    row.className = `clippy-queue-item clippy-queue-item--${job.status}`;
    row.setAttribute(
      'aria-label',
      `${formatRangeLabel(job.start, job.end)} — ${job.label}${job.error ? ` (${job.error})` : ''}`,
    );
    if (job.error) row.title = job.error;
    else row.removeAttribute('title');

    const labelEl = row.querySelector('.clippy-queue-label');
    if (labelEl) labelEl.textContent = job.label;

    const bar = row.querySelector('.clippy-queue-bar');
    const fill = row.querySelector('.clippy-queue-bar-fill');
    if (bar instanceof HTMLElement) {
      bar.className = `clippy-queue-bar clippy-queue-bar--${busy ? 'active' : job.status}`;
      bar.setAttribute('aria-label', `${job.label} ${pct}%`);
    }
    if (fill instanceof HTMLElement) {
      fill.style.width = `${queueBarWidth(job.status, job.progress)}%`;
      if (busy) fill.classList.add('clippy-queue-bar-fill--animating');
      else fill.classList.remove('clippy-queue-bar-fill--animating');
    }

    this.#syncLink(row, job);
    this.#syncDismiss(row, job);
    this.#syncOptionsHint(row, job);
    return true;
  }

  /** @param {ClipQueueJob} job */
  #buildJobRow(job) {
    const busy = job.status !== 'done' && job.status !== 'error';
    const pct = Math.round(clampProgress(job.progress) * 100);

    const el = document.createElement('div');
    el.className = `clippy-queue-item clippy-queue-item--${job.status}`;
    el.dataset.jobId = job.id;
    el.setAttribute(
      'aria-label',
      `${formatRangeLabel(job.start, job.end)} — ${job.label}${job.error ? ` (${job.error})` : ''}`,
    );
    if (job.error) el.title = job.error;

    el.addEventListener('pointerenter', () => {
      this.#hoverJobId = job.id;
    });
    el.addEventListener('pointerleave', () => {
      if (this.#hoverJobId === job.id) this.#hoverJobId = null;
    });

    if (job.thumbUrl && isSafeThumbUrl(job.thumbUrl)) {
      const img = document.createElement('img');
      img.className = 'clippy-queue-thumb';
      img.alt = '';
      img.decoding = 'async';
      img.src = job.thumbUrl;
      el.appendChild(img);
    } else {
      const empty = document.createElement('div');
      empty.className = 'clippy-queue-thumb clippy-queue-thumb--empty';
      empty.setAttribute('aria-hidden', 'true');
      el.appendChild(empty);
    }

    const body = document.createElement('div');
    body.className = 'clippy-queue-body';

    const row = document.createElement('div');
    row.className = 'clippy-queue-row';

    const range = document.createElement('span');
    range.className = 'clippy-queue-range';
    range.textContent = formatRangeLabel(job.start, job.end);

    const label = document.createElement('span');
    label.className = 'clippy-queue-label';
    label.textContent = job.label;

    row.append(range, label);
    body.appendChild(row);

    const bar = document.createElement('div');
    bar.className = `clippy-queue-bar clippy-queue-bar--${busy ? 'active' : job.status}`;
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-label', `${job.label} ${pct}%`);

    const fill = document.createElement('div');
    fill.className = 'clippy-queue-bar-fill';
    if (busy) fill.classList.add('clippy-queue-bar-fill--animating');
    fill.style.width = `${queueBarWidth(job.status, job.progress)}%`;
    bar.appendChild(fill);
    body.appendChild(bar);

    el.appendChild(body);
    this.#syncLink(el, job);
    this.#syncDismiss(el, job);
    this.#syncOptionsHint(el, job);
    return el;
  }

  #renderGlobal() {
    if (!this.#inner) return;
    const hasGlobal = Boolean(this.#globalStatus);
    let globalEl = this.#inner.querySelector('.clippy-queue-global');
    if (hasGlobal) {
      if (!(globalEl instanceof HTMLElement)) {
        globalEl = document.createElement('div');
        globalEl.setAttribute('role', 'status');
        globalEl.setAttribute('aria-live', 'polite');
        this.#inner.prepend(globalEl);
      }
      globalEl.className = `clippy-queue-global clippy-queue-global--${this.#globalVariant}`;
      globalEl.textContent = this.#globalStatus || '';
    } else if (globalEl) {
      globalEl.remove();
    }
  }

  #reconcileJobs() {
    if (!this.#inner) return;

    const existing = new Map(
      [...this.#inner.querySelectorAll('[data-job-id]')].map((node) => [
        node.getAttribute('data-job-id'),
        node,
      ]),
    );

    for (const job of this.#jobs) {
      const node = existing.get(job.id);
      if (node instanceof HTMLElement) {
        this.#patchJobRow(job);
        existing.delete(job.id);
        this.#inner.appendChild(node);
      } else {
        this.#inner.appendChild(this.#buildJobRow(job));
      }
    }

    for (const stale of existing.values()) stale.remove();

    const g = this.#inner.querySelector('.clippy-queue-global');
    if (g) this.#inner.prepend(g);
  }

  #render() {
    if (!this.#root) return;

    const hasJobs = this.#jobs.length > 0;
    const hasGlobal = Boolean(this.#globalStatus);
    if (!hasJobs && !hasGlobal) {
      while (this.#root.firstChild) this.#root.removeChild(this.#root.firstChild);
      this.#inner = null;
      this.#root.hidden = true;
      return;
    }

    this.#root.hidden = false;

    if (!this.#inner || !this.#inner.isConnected) {
      while (this.#root.firstChild) this.#root.removeChild(this.#root.firstChild);
      const inner = document.createElement('div');
      inner.className = 'clippy-queue-inner';
      this.#root.appendChild(inner);
      this.#inner = inner;
    }
    if (!this.#inner) return;

    this.#renderGlobal();
    this.#reconcileJobs();
  }
}

/**
 * @param {number} start
 * @param {number} end
 */
function formatRangeLabel(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';
  return `${formatDuration(start)} – ${formatDuration(end)}`;
}

const clippyQueue = new ClipQueue();
globalThis.clippyQueue = clippyQueue;
globalThis.isSafeThumbUrl = isSafeThumbUrl;
globalThis.isSafeLinkUrl = isSafeLinkUrl;
globalThis.isQueueStatus = isQueueStatus;
globalThis.clampProgress = clampProgress;
globalThis.queueBarWidth = queueBarWidth;
