/** @file Remote extension version check against worker /api/extension. */

const UPDATE_STORAGE_KEY = 'clippy.update';

/**
 * @typedef {{
 *   available: boolean;
 *   localVersion: string;
 *   remoteVersion: string;
 *   zipUrl: string;
 *   installUrl: string;
 *   checkedAt: number;
 * }} UpdateState
 */

/**
 * @param {string} workerUrl
 * @param {string} localVersion
 * @param {{ fetch?: typeof fetch }} [opts]
 * @returns {Promise<UpdateState>}
 */
async function checkExtensionUpdate(workerUrl, localVersion, opts = {}) {
  const fetchFn = opts.fetch || globalThis.fetch;
  if (typeof assertWorkerUrl !== 'function') {
    throw new Error('missing_assert_worker_url');
  }
  if (typeof isRemoteNewer !== 'function') {
    throw new Error('missing_semver');
  }

  const origin = assertWorkerUrl(workerUrl);
  const res = await fetchFn(`${origin}/api/extension`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`update_check_http_${res.status}`);
  }

  const data = await res.json();
  const remoteVersion =
    data && typeof data.version === 'string' ? data.version.trim() : '';
  if (!remoteVersion) {
    throw new Error('update_check_invalid');
  }

  const installUrl =
    data && typeof data.installUrl === 'string' && data.installUrl
      ? data.installUrl
      : `${origin}/install`;
  const zipUrl =
    data && typeof data.zipUrl === 'string' && data.zipUrl
      ? data.zipUrl
      : `${origin}/extension.zip`;

  /** @type {UpdateState} */
  const state = {
    available: isRemoteNewer(localVersion, remoteVersion),
    localVersion,
    remoteVersion,
    zipUrl,
    installUrl,
    checkedAt: Date.now(),
  };
  return state;
}

/**
 * @param {UpdateState} state
 */
async function writeUpdateState(state) {
  await chrome.storage.local.set({ [UPDATE_STORAGE_KEY]: state });
}

/**
 * @returns {Promise<UpdateState | null>}
 */
async function readUpdateState() {
  const stored = await chrome.storage.local.get(UPDATE_STORAGE_KEY);
  const raw = stored[UPDATE_STORAGE_KEY];
  if (!raw || typeof raw !== 'object') return null;
  return /** @type {UpdateState} */ (raw);
}

globalThis.CLIPPY_UPDATE_STORAGE_KEY = UPDATE_STORAGE_KEY;
globalThis.checkExtensionUpdate = checkExtensionUpdate;
globalThis.writeUpdateState = writeUpdateState;
globalThis.readUpdateState = readUpdateState;
