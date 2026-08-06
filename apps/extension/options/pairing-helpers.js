/**
 * Pure helpers for options pairing / worker URL validation.
 * IIFE so classic-script function names do not leak into the shared page scope
 * (options.js also binds these names via const).
 */
(function () {
  /**
   * @param {string} raw
   * @returns {string | null}
   */
  function extractPairingCode(raw) {
    const trimmed = String(raw).trim();
    try {
      const url = new URL(trimmed);
      if (url.protocol === 'clippy:' && url.hostname === 'pair') {
        const code = url.searchParams.get('code');
        return code ? code.toUpperCase() : null;
      }
    } catch {
      /* plain */
    }
    const m = /code=([A-Z0-9]{6,12})/i.exec(trimmed);
    if (m) return m[1].toUpperCase();
    if (/^[A-Z0-9]{6,12}$/i.test(trimmed)) return trimmed.toUpperCase();
    return null;
  }

  /**
   * @param {unknown} deepLink
   * @returns {deepLink is string}
   */
  function isValidPairingDeepLink(deepLink) {
    return (
      typeof deepLink === 'string' &&
      deepLink.startsWith('clippy://pair') &&
      Boolean(extractPairingCode(deepLink))
    );
  }

  /**
   * @param {unknown} url
   * @returns {boolean}
   */
  function isAllowedWorkerUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    try {
      const u = new URL(url);
      const host = u.hostname;
      const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
      if (u.protocol === 'http:') return isLocal;
      if (u.protocol !== 'https:') return false;
      if (isLocal) return true;
      if (host === 'workers.dev' || host.endsWith('.workers.dev')) return true;
      const fallback = String(globalThis.CLIPPY_DEFAULT_WORKER_URL || '').replace(/\/+$/, '');
      if (fallback && u.href.replace(/\/+$/, '') === fallback) return true;
      return false;
    } catch {
      return false;
    }
  }

  /**
   * @param {string} url
   */
  function normalizeWorkerBase(url) {
    return url.replace(/\/+$/, '');
  }

  globalThis.extractPairingCode = extractPairingCode;
  globalThis.isValidPairingDeepLink = isValidPairingDeepLink;
  globalThis.isAllowedWorkerUrl = isAllowedWorkerUrl;
  globalThis.normalizeWorkerBase = normalizeWorkerBase;
})();
