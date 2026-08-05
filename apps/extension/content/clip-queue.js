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
 *   status: 'queued' | 'download' | 'crop' | 'upload' | 'done' | 'error';
 *   label: string;
 *   progress: number;
 *   error?: string;
 *   galleryUrl?: string;
 *   thumbUrl?: string;
 * }} ClipQueueJob */

class ClipQueue {
  /** @type {ClipQueueJob[]} */
  #jobs = [];
  /** @type {HTMLElement | null} */
  #root = null;
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
      label: 'En file d’attente…',
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
   * }} patch
   */
  update(jobId, patch) {
    const job = this.#jobs.find((j) => j.id === jobId);
    if (!job) return;
    if (patch.status) job.status = patch.status;
    if (typeof patch.label === 'string') job.label = patch.label;
    if (typeof patch.progress === 'number') job.progress = clamp(patch.progress, 0, 1);
    if (patch.error) job.error = patch.error;
    if (patch.galleryUrl) job.galleryUrl = patch.galleryUrl;
    this.#render();

    if (job.status === 'done') {
      window.setTimeout(() => this.#removeJob(jobId), 5000);
    } else if (job.status === 'error') {
      window.setTimeout(() => this.#removeJob(jobId), 8000);
    }
  }

  /** @param {string} jobId */
  #removeJob(jobId) {
    this.#jobs = this.#jobs.filter((j) => j.id !== jobId);
    this.#render();
    if (this.#jobs.length === 0 && !this.#globalStatus) {
      this.#unmount();
    }
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
      // Prefer first child of #below (right under the player)
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
  }

  #render() {
    if (!this.#root) return;

    const hasJobs = this.#jobs.length > 0;
    const hasGlobal = Boolean(this.#globalStatus);
    if (!hasJobs && !hasGlobal) {
      this.#root.innerHTML = '';
      this.#root.hidden = true;
      return;
    }

    this.#root.hidden = false;

    const jobsHtml = this.#jobs
      .map((job) => {
        const pct = Math.round(job.progress * 100);
        const range = `${formatDuration(job.start)} – ${formatDuration(job.end)}`;
        const statusClass = `clippy-queue-item--${job.status}`;
        const thumb = job.thumbUrl
          ? `<img class="clippy-queue-thumb" src="${job.thumbUrl}" alt="" />`
          : `<div class="clippy-queue-thumb clippy-queue-thumb--empty" aria-hidden="true"></div>`;
        const action =
          job.status === 'done' && job.galleryUrl
            ? `<a class="clippy-queue-link" href="${job.galleryUrl}" target="_blank" rel="noopener">Voir</a>`
            : '';

        return `
          <div class="clippy-queue-item ${statusClass}" data-job-id="${job.id}">
            ${thumb}
            <div class="clippy-queue-body">
              <div class="clippy-queue-row">
                <span class="clippy-queue-range">${range}</span>
                <span class="clippy-queue-label">${escapeHtml(job.label)}</span>
                ${action}
              </div>
              <div class="clippy-queue-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
                <div class="clippy-queue-bar-fill" style="width:${pct}%"></div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    const globalHtml = hasGlobal
      ? `<div class="clippy-queue-global clippy-queue-global--${this.#globalVariant}">${escapeHtml(this.#globalStatus || '')}</div>`
      : '';

    this.#root.innerHTML = `
      <div class="clippy-queue-inner">
        ${globalHtml}
        ${jobsHtml}
      </div>
    `;
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

const clippyQueue = new ClipQueue();
globalThis.clippyQueue = clippyQueue;
globalThis.ClipQueue = ClipQueue;
