/**
 * Debug logging. Off by default — set `globalThis.CLIPPY_DEBUG = true`
 * or `chrome.storage.local.clippyDebug = true`.
 */

/** @type {boolean | null} */
let cachedDebug = null;

function isClippyDebug() {
  if (globalThis.CLIPPY_DEBUG === true) return true;
  if (globalThis.CLIPPY_DEBUG === false) return false;
  if (cachedDebug != null) return cachedDebug;
  return false;
}

function refreshDebugFlag() {
  try {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) return;
    chrome.storage.local.get('clippyDebug', (result) => {
      cachedDebug = result?.clippyDebug === true;
    });
  } catch {
    /* storage unavailable (tests / non-extension) */
  }
}

refreshDebugFlag();

try {
  if (typeof chrome !== 'undefined' && chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.clippyDebug) {
        cachedDebug = changes.clippyDebug.newValue === true;
      }
    });
  }
} catch {
  /* ignore */
}

/** @param {string} scope @param {string} step @param {unknown} [data] */
function clippyLog(scope, step, data) {
  if (!isClippyDebug()) return;

  if (data === undefined) {
    console.log(`[Clippy][${scope}] ${step}`);
    return;
  }

  try {
    console.log(`[Clippy][${scope}] ${step} ${JSON.stringify(data)}`);
  } catch {
    console.log(`[Clippy][${scope}] ${step}`, data);
  }
}

globalThis.clippyLog = clippyLog;
globalThis.isClippyDebug = isClippyDebug;
