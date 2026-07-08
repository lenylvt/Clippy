/** @type {HTMLElement | null} */
let statusBadge = null;

/** @param {string} label @param {{ variant?: 'default' | 'error' }} [options] */
function showStatusBadge(label, options = {}) {
  hideStatusBadge();

  const badge = document.createElement('div');
  badge.className = 'clippy-recording-badge';
  if (options.variant === 'error') {
    badge.classList.add('clippy-recording-badge--error');
  }

  const dot = document.createElement('span');
  dot.className = 'clippy-recording-dot';
  dot.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.textContent = label;

  badge.append(dot, text);
  document.body.appendChild(badge);
  statusBadge = badge;
}

function hideStatusBadge() {
  statusBadge?.remove();
  statusBadge = null;
}

globalThis.showStatusBadge = showStatusBadge;
globalThis.hideStatusBadge = hideStatusBadge;
