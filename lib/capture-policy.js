/** @param {string} source */
function canPrimeCapture(source) {
  return source === 'command' || source === 'action';
}

/** @param {string} source */
function captureNotAuthorizedResponse(source) {
  return {
    ok: false,
    error: 'capture_not_authorized',
    source,
    hint: 'Clique l’icône Clippy ou utilise Ctrl+Shift+C avant de sauver.',
  };
}

globalThis.canPrimeCapture = canPrimeCapture;
globalThis.captureNotAuthorizedResponse = captureNotAuthorizedResponse;
