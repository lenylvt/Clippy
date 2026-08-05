// Bouton Clippy dans .ytp-right-controls (à gauche du plein écran)

/** Icon fournie : crochets + check (style YT 36×36). */
const CLIPPY_ICON = `
<svg height="100%" width="100%" viewBox="0 0 36 36" aria-hidden="true">
  <g fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M13.5 10.5h-2.2c-1.2 0-2.1.9-2.1 2.1v10.8c0 1.2.9 2.1 2.1 2.1h2.2"/>
    <path d="M22.5 10.5h2.2c1.2 0 2.1.9 2.1 2.1v10.8c0 1.2-.9 2.1-2.1 2.1h-2.2"/>
  </g>
  <path fill="#fff" d="M15.6 18.2 17.4 20l4.2-4.4 1.3 1.3-5.5 5.7-3.1-3.1z"/>
</svg>`;

/**
 * @param {() => void} onClick
 */
function injectPlayerButton(onClick) {
  const mount = () => {
    // Barre droite du player YT (settings / miniplayer / fullscreen)
    const container =
      document.querySelector('.ytp-right-controls-left') ||
      document.querySelector('.ytp-right-controls');
    if (!container || container.querySelector('.ytp-clippy-button')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ytp-button ytp-clippy-button';
    button.setAttribute('aria-label', 'Clipper avec Clippy');
    button.setAttribute('title', 'Clipper');
    button.innerHTML = CLIPPY_ICON;

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });

    // Juste avant le bouton plein écran (ou settings en fallback)
    const anchor =
      container.querySelector('.ytp-fullscreen-button') ||
      container.querySelector('.ytp-size-button') ||
      container.querySelector('.ytp-settings-button');
    if (anchor) {
      container.insertBefore(button, anchor);
    } else {
      container.appendChild(button);
    }
  };

  mount();
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

window.injectPlayerButton = injectPlayerButton;
