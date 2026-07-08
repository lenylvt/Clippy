/** @param {string} scope @param {string} step @param {unknown} [data] */
function clippyLog(scope, step, data) {
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
