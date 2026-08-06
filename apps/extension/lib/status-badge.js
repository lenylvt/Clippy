/**
 * Progress is shown under the player via clip-queue.
 * These helpers stay for call-site compatibility.
 */

const FALLBACK_HIDE_MS = 2200;
const FALLBACK_ERROR_HIDE_MS = 4500;

/** @type {ReturnType<typeof setTimeout> | null} */
let fallbackHideTimer = null;

/** @param {string} label @param {{ variant?: 'default' | 'error'; sticky?: boolean }} [options] */
function showStatusBadge(label, options = {}) {
  if (globalThis.clippyQueue) {
    globalThis.clippyQueue.setGlobalStatus(label, options);
    return;
  }

  // Minimal fallback if queue not loaded yet
  let el = document.querySelector('[data-clippy-fallback-status]');
  const needsCreate =
    !el ||
    typeof el !== 'object' ||
    typeof /** @type {{ setAttribute?: unknown }} */ (el).setAttribute !== 'function';
  if (needsCreate) {
    el = document.createElement('div');
    el.className = 'clippy-fallback-status';
    el.setAttribute('data-clippy-fallback-status', '1');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483646;padding:8px 14px;border-radius:8px;background:rgba(15,15,15,.92);color:#fff;font:13px system-ui,sans-serif;border:1px solid transparent;';
    const host = document.body ?? document.documentElement;
    host.appendChild(el);
  }

  el.textContent = label;
  if (options.variant === 'error') {
    el.style.border = '1px solid #f55';
    el.setAttribute('aria-live', 'assertive');
  } else {
    el.style.border = '1px solid transparent';
    el.setAttribute('aria-live', 'polite');
  }

  if (fallbackHideTimer != null) {
    clearTimeout(fallbackHideTimer);
    fallbackHideTimer = null;
  }

  if (!options.sticky) {
    const ms = options.variant === 'error' ? FALLBACK_ERROR_HIDE_MS : FALLBACK_HIDE_MS;
    fallbackHideTimer = setTimeout(() => {
      fallbackHideTimer = null;
      hideStatusBadge();
    }, ms);
  }
}

function hideStatusBadge() {
  if (fallbackHideTimer != null) {
    clearTimeout(fallbackHideTimer);
    fallbackHideTimer = null;
  }
  if (globalThis.clippyQueue) {
    globalThis.clippyQueue.clearGlobalStatus();
  }
  document.querySelector('[data-clippy-fallback-status]')?.remove();
}

globalThis.showStatusBadge = showStatusBadge;
globalThis.hideStatusBadge = hideStatusBadge;
