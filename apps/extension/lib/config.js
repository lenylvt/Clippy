/** @file Sync note: worker URL allowlist for Bearer requests. */

const DEFAULT_WORKER_URL = 'https://clippy.runtimelayer.workers.dev';

/**
 * Allowed worker hosts: production default + local HTTP for dev.
 * Rejects arbitrary `*.workers.dev` so a poisoned sync `workerUrl` cannot exfiltrate the device token.
 * @param {string} workerUrl
 * @returns {string} Origin without trailing slash
 */
function assertWorkerUrl(workerUrl) {
  if (typeof workerUrl !== 'string' || !workerUrl.trim()) {
    throw new Error('missing_worker_url');
  }

  let parsed;
  try {
    parsed = new URL(workerUrl.trim());
  } catch {
    throw new Error('invalid_worker_url');
  }

  const host = parsed.hostname.toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const isDefault = host === new URL(DEFAULT_WORKER_URL).hostname;

  if (isLocal) {
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('invalid_worker_url');
    }
  } else if (parsed.protocol !== 'https:' || !isDefault) {
    throw new Error('invalid_worker_url');
  }

  return parsed.origin;
}

globalThis.CLIPPY_DEFAULT_WORKER_URL = DEFAULT_WORKER_URL;
globalThis.assertWorkerUrl = assertWorkerUrl;
