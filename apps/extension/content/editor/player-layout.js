/**
 * @param {HTMLVideoElement | null} video
 * @returns {HTMLElement | null}
 */
function getYoutubePlayerElement(video) {
  const closest = video?.closest('.html5-video-player, #movie_player');
  if (closest instanceof HTMLElement) return closest;
  const player = document.querySelector('#movie_player');
  return player instanceof HTMLElement ? player : null;
}

/**
 * @param {HTMLVideoElement | null} video
 * @returns {DOMRect | null}
 */
function getYoutubePlayerRect(video) {
  return getYoutubePlayerElement(video)?.getBoundingClientRect() ?? null;
}

/**
 * Prefer the <video> box — player chrome often extends below the picture.
 * @param {HTMLVideoElement | null} video
 * @returns {DOMRect | null}
 */
function getYoutubeVideoRect(video) {
  if (video) {
    const r = video.getBoundingClientRect();
    if (r.width > 40 && r.height > 40) return r;
  }
  return getYoutubePlayerRect(video);
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
 * @returns {{ width: number; height: number; offsetTop: number; offsetLeft: number }}
 */
function getEditorViewport() {
  const vv = window.visualViewport;
  if (vv) {
    return {
      width: vv.width,
      height: vv.height,
      offsetTop: vv.offsetTop,
      offsetLeft: vv.offsetLeft,
    };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    offsetTop: 0,
    offsetLeft: 0,
  };
}

/**
 * Panel flush to the video picture: inset L/R/B, never overflow below.
 * @param {HTMLElement} root
 * @param {DOMRect} anchorRect video (or player) rect
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

  const safeInset = typeof inset === 'number' && Number.isFinite(inset) ? Math.max(0, inset) : 10;
  const vp = getEditorViewport();
  const viewportW = vp.width;
  const viewportH = vp.height;

  const holeTop = anchorRect.top;
  const holeLeft = anchorRect.left;
  const holeRight = anchorRect.right;
  const holeBottom = anchorRect.bottom;

  if (shades.top instanceof HTMLElement) {
    shades.top.style.top = '0px';
    shades.top.style.left = '0px';
    shades.top.style.width = `${viewportW}px`;
    shades.top.style.height = `${Math.max(0, holeTop)}px`;
  }
  if (shades.left instanceof HTMLElement) {
    shades.left.style.top = `${holeTop}px`;
    shades.left.style.left = '0px';
    shades.left.style.width = `${Math.max(0, holeLeft)}px`;
    shades.left.style.height = `${anchorRect.height}px`;
  }
  if (shades.right instanceof HTMLElement) {
    shades.right.style.top = `${holeTop}px`;
    shades.right.style.left = `${holeRight}px`;
    shades.right.style.width = `${Math.max(0, viewportW - holeRight)}px`;
    shades.right.style.height = `${anchorRect.height}px`;
  }
  if (shades.bottom instanceof HTMLElement) {
    shades.bottom.style.top = `${holeBottom}px`;
    shades.bottom.style.left = '0px';
    shades.bottom.style.width = `${viewportW}px`;
    shades.bottom.style.height = `${Math.max(0, viewportH - holeBottom)}px`;
  }

  frame.style.top = `${anchorRect.top}px`;
  frame.style.left = `${anchorRect.left}px`;
  frame.style.width = `${anchorRect.width}px`;
  frame.style.height = `${anchorRect.height}px`;

  const panelWidth = Math.max(0, anchorRect.width - safeInset * 2);
  // Measure real height after width is known (wrap/toolbar).
  panel.style.width = `${panelWidth}px`;
  panel.style.left = `${anchorRect.left + safeInset}px`;
  const measured = panel.offsetHeight || globalThis.CLIPPY_PANEL_HEIGHT || 96;
  const maxTop = holeBottom - safeInset - measured;
  const minTop = holeTop + safeInset;
  const panelTop = Math.max(minTop, Math.min(maxTop, holeBottom - measured - safeInset));

  panel.style.top = `${panelTop}px`;
  panel.style.setProperty('--clippy-panel-inset', `${safeInset}px`);
}

globalThis.getYoutubePlayerElement = getYoutubePlayerElement;
globalThis.getYoutubePlayerRect = getYoutubePlayerRect;
globalThis.getYoutubeVideoRect = getYoutubeVideoRect;
globalThis.syncEditorOverlayParent = syncEditorOverlayParent;
globalThis.applyEditorOverlayLayout = applyEditorOverlayLayout;
globalThis.getEditorViewport = getEditorViewport;
