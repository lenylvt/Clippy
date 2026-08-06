/**
 * Multi-clip queue + discreet progress dock under the YouTube player.
 *
 * Mount targets (in order):
 *  - #below (classic watch page)
 *  - #primary-inner
 *  - after #player
 */

/** @typedef {{
 *   id: string;
 *   start: number;
 *   end: number;
 *   status: 'queued' | 'preparing' | 'download' | 'crop' | 'upload' | 'done' | 'error';
 *   label: string;
 *   progress: number;
 *   error?: string;
 *   galleryUrl?: string;
 *   thumbUrl?: string;
 *   url?: string;
 * }} ClipQueueJob */

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

  /** @returns {ClipQueueJob[]} */
  get jobs() {
    return this.#jobs.slice();
  }

  /**
   * @param {{ start: number; end: number; thumbUrl?: string }} clip
   * @returns {ClipQueueJob}
   */
  enqueue(clip) {
    /** @type {ClipQueueJob} */
    const job = {
      id: `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      start: clip.start,
      end: clip.end,
      status: 'queued',
      label: 'En attente',
      progress: 0,
      thumbUrl: clip.thumbUrl,
    };
    this.#jobs.unshift(job);
    this.#ensureMounted();
    this.#render();
    return job;
  }

  /**
   * @param {string} jobId
   * @param {{
   *   status?: ClipQueueJob['status'];
   *   label?: string;
   *   progress?: number;
   *   error?: string;
   *   galleryUrl?: string;
   *   url?: string;
   * }} patch
   */
  update(jobId, patch) {
    const job = this.#jobs.find((j) => j.id === jobId);
    if (!job) return;
    if (patch.status) job.status = patch.status;
    if (typeof patch.label === 'string') job.label = patch.label;
    if (typeof patch.progress === 'number') job.progress = clamp(patch.progress, 0, 1);
    if (patch.error) job.error = patch.error;
    if (patch.url) job.url = patch.url;

    if (!this.#patchJobRow(job)) this.#render();

    if (job.status === 'done') {
      window.setTimeout(() => this.#removeJob(jobId), 5000);
    } else if (job.status === 'error') {
      window.setTimeout(() => this.#removeJob(jobId), 8000);
    }
  }

  /** @param {string} jobId */
  #removeJob(jobId) {
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
    this.#render();
    if (this.#jobs.length === 0) this.#unmount();
  }

  /** @returns {HTMLElement | null} */
  #findMountHost() {
    const below = document.querySelector('#below');
    if (below instanceof HTMLElement) return below;

    const primaryInner = document.querySelector('#primary-inner');
    if (primaryInner instanceof HTMLElement) return primaryInner;

    const player = document.querySelector('#player');
    if (player instanceof HTMLElement) return player.parentElement;

    return null;
  }

  #ensureMounted() {
    if (this.#root?.isConnected) return;

    const root = document.createElement('div');
    root.className = 'clippy-queue';
    root.setAttribute('data-clippy-queue', '1');
    root.setAttribute('aria-live', 'polite');
    this.#root = root;

    const host = this.#findMountHost();
    if (host) {
      if (host.id === 'below' || host.id === 'primary-inner') {
        host.prepend(root);
      } else {
        host.insertAdjacentElement('afterend', root);
      }
    } else {
      document.body.appendChild(root);
    }

    if (!this.#mountObserver) {
      this.#mountObserver = new MutationObserver(() => {
        if (!this.#root) return;
        if (this.#root.isConnected) return;
        const nextHost = this.#findMountHost();
        if (nextHost) {
          if (nextHost.id === 'below' || nextHost.id === 'primary-inner') {
            nextHost.prepend(this.#root);
          } else {
            nextHost.insertAdjacentElement('afterend', this.#root);
          }
        }
      });
      this.#mountObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  #unmount() {
    this.#root?.remove();
    this.#root = null;
    this.#inner = null;
  }

  /** @param {ClipQueueJob} job */
  #barWidth(job) {
    return queueBarWidth(job.status, job.progress);
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
    const pct = Math.round(clamp(job.progress, 0, 1) * 100);
    row.className = `clippy-queue-item clippy-queue-item--${job.status}`;

    const labelEl = row.querySelector('.clippy-queue-label');
    if (labelEl) labelEl.textContent = job.label;

    const bar = row.querySelector('.clippy-queue-bar');
    const fill = row.querySelector('.clippy-queue-bar-fill');
    if (bar instanceof HTMLElement) {
      bar.className = `clippy-queue-bar clippy-queue-bar--${busy ? 'active' : job.status}`;
      bar.setAttribute('aria-label', `${job.label} ${pct}%`);
    }
    if (fill instanceof HTMLElement) {
      fill.style.width = `${this.#barWidth(job)}%`;
    }

    let link = row.querySelector('.clippy-queue-link');
    if (job.status === 'done' && job.url) {
      if (!(link instanceof HTMLAnchorElement)) {
        link = document.createElement('a');
        link.className = 'clippy-queue-link';
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Ouvrir';
        row.querySelector('.clippy-queue-row')?.appendChild(link);
      }
      /** @type {HTMLAnchorElement} */ (link).href = job.url;
    } else if (link) {
      link.remove();
    }

    return true;
  }

  /** @param {ClipQueueJob} job */
  #buildJobRow(job) {
    const range = `${formatDuration(job.start)} – ${formatDuration(job.end)}`;
    const busy = job.status !== 'done' && job.status !== 'error';
    const pct = Math.round(clamp(job.progress, 0, 1) * 100);
    const thumb = job.thumbUrl
      ? `<img class="clippy-queue-thumb" src="${job.thumbUrl}" alt="" />`
      : `<div class="clippy-queue-thumb clippy-queue-thumb--empty" aria-hidden="true"></div>`;
    const action =
      job.status === 'done' && job.url
        ? `<a class="clippy-queue-link" href="${job.url}" target="_blank" rel="noopener">Ouvrir</a>`
        : '';

    const el = document.createElement('div');
    el.className = `clippy-queue-item clippy-queue-item--${job.status}`;
    el.dataset.jobId = job.id;
    el.innerHTML = `
      ${thumb}
      <div class="clippy-queue-body">
        <div class="clippy-queue-row">
          <span class="clippy-queue-range">${range}</span>
          <span class="clippy-queue-label">${escapeHtml(job.label)}</span>
          ${action}
        </div>
        <div class="clippy-queue-bar clippy-queue-bar--${busy ? 'active' : job.status}" role="status" aria-label="${escapeHtml(job.label)} ${pct}%">
          <div class="clippy-queue-bar-fill" style="width:${this.#barWidth(job)}%"></div>
        </div>
      </div>
    `;
    return el;
  }

  #render() {
    if (!this.#root) return;

    const hasJobs = this.#jobs.length > 0;
    const hasGlobal = Boolean(this.#globalStatus);
    if (!hasJobs && !hasGlobal) {
      this.#root.innerHTML = '';
      this.#inner = null;
      this.#root.hidden = true;
      return;
    }

    this.#root.hidden = false;

    if (!this.#inner || !this.#inner.isConnected) {
      this.#root.innerHTML = '<div class="clippy-queue-inner"></div>';
      this.#inner = this.#root.querySelector('.clippy-queue-inner');
    }
    if (!this.#inner) return;

    let globalEl = this.#inner.querySelector('.clippy-queue-global');
    if (hasGlobal) {
      if (!(globalEl instanceof HTMLElement)) {
        globalEl = document.createElement('div');
        this.#inner.prepend(globalEl);
      }
      globalEl.className = `clippy-queue-global clippy-queue-global--${this.#globalVariant}`;
      globalEl.textContent = this.#globalStatus || '';
    } else if (globalEl) {
      globalEl.remove();
    }

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
        // Keep order: move after global / previous jobs
        this.#inner.appendChild(node);
      } else {
        this.#inner.appendChild(this.#buildJobRow(job));
      }
    }

    for (const stale of existing.values()) stale.remove();

    // Re-append global first
    const g = this.#inner.querySelector('.clippy-queue-global');
    if (g) this.#inner.prepend(g);
  }
}

/** @param {string} value */
function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {ClipQueueJob['status']} status
 * @param {number} progress
 */
function queueBarWidth(status, progress) {
  // Keep in sync with @clippy/shared/stages queueBarWidth.
  const busy = status !== 'done' && status !== 'error';
  const pct = Math.round(clamp(progress, 0, 1) * 100);
  if (!busy) return 100;
  return Math.max(pct, status === 'queued' ? 4 : 8);
}

const clippyQueue = new ClipQueue();
globalThis.clippyQueue = clippyQueue;
globalThis.ClipQueue = ClipQueue;
globalThis.queueBarWidth = queueBarWidth;
