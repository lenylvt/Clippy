/**
 * @param {HTMLVideoElement | null} video
 * @returns {HTMLElement | null}
 */
function getYoutubePlayerElement(video) {
  const player = document.querySelector('#movie_player');
  if (player instanceof HTMLElement) return player;
  const closest = video?.closest('.html5-video-player');
  return closest instanceof HTMLElement ? closest : null;
}

/**
 * @param {HTMLVideoElement | null} video
 * @returns {DOMRect | null}
 */
function getYoutubePlayerRect(video) {
  return getYoutubePlayerElement(video)?.getBoundingClientRect() ?? null;
}

/**
 * @param {HTMLVideoElement | null} video
 * @returns {DOMRect | null}
 */
function getYoutubeVideoRect(video) {
  return video?.getBoundingClientRect() ?? getYoutubePlayerRect(video);
}

/**
 * @param {HTMLElement} root
 */
function syncEditorOverlayParent(root) {
  const parent = document.fullscreenElement instanceof HTMLElement ? document.fullscreenElement : document.body;
  if (root.parentElement !== parent) {
    parent.appendChild(root);
  }
}

/**
 * @param {HTMLElement} root
 * @param {DOMRect} anchorRect
 * @param {number} [inset]
 */
function applyEditorOverlayLayout(root, anchorRect, inset = globalThis.CLIPPY_PANEL_INSET) {
  const frame = root.querySelector('[data-video-frame]');
  const panel = root.querySelector('[data-panel]');
  const shades = {
    top: root.querySelector('[data-shade="top"]'),
    left: root.querySelector('[data-shade="left"]'),
    right: root.querySelector('[data-shade="right"]'),
    bottom: root.querySelector('[data-shade="bottom"]'),
  };

  if (!(frame instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  const holeTop = anchorRect.top;
  const holeLeft = anchorRect.left;
  const holeRight = anchorRect.right;
  const holeBottom = anchorRect.bottom;

  if (shades.top instanceof HTMLElement) {
    shades.top.style.cssText = `top:0;left:0;width:${viewportW}px;height:${Math.max(0, holeTop)}px`;
  }
  if (shades.left instanceof HTMLElement) {
    shades.left.style.cssText = `top:${holeTop}px;left:0;width:${Math.max(0, holeLeft)}px;height:${anchorRect.height}px`;
  }
  if (shades.right instanceof HTMLElement) {
    shades.right.style.cssText = `top:${holeTop}px;left:${holeRight}px;width:${Math.max(0, viewportW - holeRight)}px;height:${anchorRect.height}px`;
  }
  if (shades.bottom instanceof HTMLElement) {
    shades.bottom.style.cssText = `top:${holeBottom}px;left:0;width:${viewportW}px;height:${Math.max(0, viewportH - holeBottom)}px`;
  }

  frame.style.top = `${anchorRect.top}px`;
  frame.style.left = `${anchorRect.left}px`;
  frame.style.width = `${anchorRect.width}px`;
  frame.style.height = `${anchorRect.height}px`;

  const panelWidth = Math.max(0, anchorRect.width - inset * 2);
  const panelHeight = panel.offsetHeight || 110;
  const panelLeft = anchorRect.left + inset;
  const panelTop = anchorRect.bottom - panelHeight - inset;

  panel.style.width = `${panelWidth}px`;
  panel.style.left = `${panelLeft}px`;
  panel.style.top = `${panelTop}px`;
}

globalThis.getYoutubePlayerElement = getYoutubePlayerElement;
globalThis.getYoutubePlayerRect = getYoutubePlayerRect;
globalThis.getYoutubeVideoRect = getYoutubeVideoRect;
globalThis.syncEditorOverlayParent = syncEditorOverlayParent;
globalThis.applyEditorOverlayLayout = applyEditorOverlayLayout;
