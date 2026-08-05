/**
 * Progress is shown under the player via clip-queue.
 * These helpers stay for call-site compatibility.
 */

/** @param {string} label @param {{ variant?: 'default' | 'error'; sticky?: boolean }} [options] */
function showStatusBadge(label, options = {}) {
  if (globalThis.clippyQueue) {
    globalThis.clippyQueue.setGlobalStatus(label, options);
    return;
  }

  // Minimal fallback if queue not loaded yet
  let el = document.querySelector('[data-clippy-fallback-status]');
  if (!(el instanceof HTMLElement)) {
    el = document.createElement('div');
    el.className = 'clippy-queue-global';
    el.setAttribute('data-clippy-fallback-status', '1');
    el.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:8px 14px;border-radius:8px;background:rgba(15,15,15,.92);color:#fff;font:13px Roboto,Arial,sans-serif;';
    document.body.appendChild(el);
  }
  el.textContent = label;
  if (options.variant === 'error') el.style.border = '1px solid #f55';
}

function hideStatusBadge() {
  if (globalThis.clippyQueue) {
    globalThis.clippyQueue.clearGlobalStatus();
  }
  document.querySelector('[data-clippy-fallback-status]')?.remove();
}

globalThis.showStatusBadge = showStatusBadge;
globalThis.hideStatusBadge = hideStatusBadge;
