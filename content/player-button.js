// Injecte un bouton Clippy dans les contrôles YouTube

const CLIPPY_ICON = `
<svg height="24" viewBox="0 0 24 24" width="24" aria-hidden="true">
  <path fill="#fff" d="M4 6.5C4 5.12 5.12 4 6.5 4H11v2H6.5A.5.5 0 0 0 6 6.5v11a.5.5 0 0 0 .5.5H11v2H6.5A2.5 2.5 0 0 1 4 17.5v-11ZM13 4h4.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H13v-2h4.5a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5H13V4Zm-1.2 7.3 1.4-1.4L16 12.7l-3.8 3.8-2.1-2.1 1.4-1.4.7.7 2.4-2.4Z"/>
</svg>`;

/** @param {() => void} onClick */
function injectPlayerButton(onClick) {
  const mount = () => {
    const container = document.querySelector('.ytp-right-controls-left');
    if (!container || container.querySelector('.ytp-clippy-button')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ytp-button ytp-clippy-button';
    button.setAttribute('aria-label', 'Clipper avec Clippy');
    button.setAttribute('data-tooltip-title', 'Clipper');
    button.innerHTML = CLIPPY_ICON;

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });

    const anchor = container.querySelector('.ytp-fullscreen-button');
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
