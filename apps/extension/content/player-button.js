// Bouton Clippy dans la barre droite du player (près du plein écran)

const CLIPPY_BTN_SELECTOR = '.ytp-clippy-button';
const CLIPPY_BTN_LABEL = 'Clipper avec Clippy';
const MOUNT_DEBOUNCE_MS = 160;

/** Icon : crochets + check (style YT 36×36), currentColor. */
const CLIPPY_ICON = `
<svg height="100%" width="100%" viewBox="0 0 36 36" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M13.5 10.5h-2.2c-1.2 0-2.1.9-2.1 2.1v10.8c0 1.2.9 2.1 2.1 2.1h2.2"/>
    <path d="M22.5 10.5h2.2c1.2 0 2.1.9 2.1 2.1v10.8c0 1.2-.9 2.1-2.1 2.1h-2.2"/>
  </g>
  <path fill="currentColor" d="M15.6 18.2 17.4 20l4.2-4.4 1.3 1.3-5.5 5.7-3.1-3.1z"/>
</svg>`;

/**
 * Conteneur des contrôles qui contient réellement le bouton plein écran.
 * @returns {Element | null}
 */
function findPlayerControls() {
  const fullscreen = document.querySelector('.ytp-fullscreen-button');
  if (fullscreen?.parentElement) return fullscreen.parentElement;

  return (
    document.querySelector('.ytp-right-controls') ||
    document.querySelector('.ytp-right-controls-left')
  );
}

/**
 * @param {() => void} onClick
 * @returns {HTMLButtonElement}
 */
function createPlayerButton(onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ytp-button ytp-clippy-button';
  button.setAttribute('data-clippy-player-button', '1');
  button.setAttribute('aria-label', CLIPPY_BTN_LABEL);
  button.setAttribute('title', CLIPPY_BTN_LABEL);
  button.setAttribute('aria-pressed', 'false');
  button.insertAdjacentHTML('afterbegin', CLIPPY_ICON);

  const stop = (event) => {
    if ('button' in event && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
  };

  button.addEventListener('mousedown', stop);
  button.addEventListener('pointerdown', stop);
  button.addEventListener('click', (event) => {
    if (event.button !== 0) return;
    stop(event);
    onClick();
  });

  return button;
}

/**
 * @param {HTMLButtonElement} button
 * @param {Element} container
 */
function placePlayerButton(button, container) {
  const existing = document.querySelector(CLIPPY_BTN_SELECTOR);
  if (existing && existing !== button) existing.remove();

  const anchor =
    container.querySelector('.ytp-fullscreen-button') ||
    container.querySelector('.ytp-size-button') ||
    container.querySelector('.ytp-settings-button');

  if (anchor) {
    container.insertBefore(button, anchor);
  } else {
    container.appendChild(button);
  }
}

/**
 * @param {() => void} onClick
 * @returns {{ destroy: () => void; setOpen: (open: boolean) => void; getButton: () => HTMLButtonElement | null }}
 */
function injectPlayerButton(onClick) {
  /** @type {MutationObserver | null} */
  let observer = null;
  /** @type {'hunt' | 'guard' | null} */
  let observerMode = null;
  /** @type {number} */
  let debounceTimer = 0;
  /** @type {HTMLButtonElement | null} */
  let button = null;
  let destroyed = false;

  const observeRoot = () =>
    document.querySelector('#movie_player') ||
    document.querySelector('#ytd-player') ||
    document.documentElement;

  const disconnectObserver = () => {
    observer?.disconnect();
    observer = null;
    observerMode = null;
  };

  const scheduleMount = (delay = MOUNT_DEBOUNCE_MS) => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(mount, delay);
  };

  const huntControls = () => {
    if (destroyed || observerMode === 'hunt') return;
    disconnectObserver();
    const target = observeRoot();
    if (!target) return;

    observerMode = 'hunt';
    observer = new MutationObserver(() => scheduleMount());
    observer.observe(target, { childList: true, subtree: true });
  };

  const guardButton = () => {
    if (destroyed || !button?.parentElement) return;
    disconnectObserver();

    observerMode = 'guard';
    const parent = button.parentElement;
    observer = new MutationObserver(() => {
      if (destroyed) return;
      if (!button?.isConnected) {
        disconnectObserver();
        huntControls();
        scheduleMount(80);
      }
    });
    observer.observe(parent, { childList: true });
  };

  const mount = () => {
    if (destroyed) return;

    const existing = document.querySelector(CLIPPY_BTN_SELECTOR);
    if (existing?.isConnected && existing.tagName === 'BUTTON') {
      button = /** @type {HTMLButtonElement} */ (existing);
      guardButton();
      return;
    }

    const container = findPlayerControls();
    if (!container) {
      huntControls();
      return;
    }

    if (!button || !button.isConnected) {
      button = createPlayerButton(onClick);
    }

    placePlayerButton(button, container);
    if (typeof clippyLog === 'function') clippyLog('player-button', 'mounted');
    guardButton();
  };

  const onNavigate = () => {
    if (destroyed) return;
    scheduleMount(80);
  };

  document.addEventListener('yt-navigate-finish', onNavigate);
  mount();

  return {
    destroy() {
      destroyed = true;
      window.clearTimeout(debounceTimer);
      disconnectObserver();
      document.removeEventListener('yt-navigate-finish', onNavigate);
      button?.remove();
      button = null;
      document.querySelector(CLIPPY_BTN_SELECTOR)?.remove();
    },
    /** @param {boolean} open */
    setOpen(open) {
      const el = button || document.querySelector(CLIPPY_BTN_SELECTOR);
      if (!el || el.tagName !== 'BUTTON') return;
      el.setAttribute('aria-pressed', open ? 'true' : 'false');
      const label = open ? 'Fermer Clippy' : CLIPPY_BTN_LABEL;
      el.setAttribute('title', label);
      el.setAttribute('aria-label', label);
    },
    getButton() {
      return button;
    },
  };
}

globalThis.injectPlayerButton = injectPlayerButton;
globalThis.findPlayerControls = findPlayerControls;
globalThis.createPlayerButton = createPlayerButton;
globalThis.placePlayerButton = placePlayerButton;
