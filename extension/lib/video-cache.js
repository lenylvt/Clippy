/** @typedef {{
 *   videoId: string;
 *   youtubeUrl: string;
 *   blob: Blob;
 *   createdAt: number;
 *   lastActiveAt: number;
 *   leftAt: number | null;
 * }} CachedVideo */

const VIDEO_CACHE_DB = 'clippy-video-cache';
const VIDEO_CACHE_STORE = 'videos';
const VIDEO_CACHE_VERSION = 1;
/** Always purge cached sources 3h after creation (even if still “active”). */
const VIDEO_CACHE_TTL_MS = 3 * 60 * 60 * 1000;

/** @type {Promise<IDBDatabase> | null} */
let videoCacheDbPromise = null;

/** @returns {Promise<IDBDatabase>} */
function openVideoCacheDb() {
  if (!videoCacheDbPromise) {
    videoCacheDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(VIDEO_CACHE_DB, VIDEO_CACHE_VERSION);

      request.onerror = () => {
        videoCacheDbPromise = null;
        reject(request.error ?? new Error('video_cache_open_failed'));
      };

      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(VIDEO_CACHE_STORE)) {
          db.createObjectStore(VIDEO_CACHE_STORE, { keyPath: 'videoId' });
        }
      };
    });
  }

  return videoCacheDbPromise;
}

/**
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('idb_request_failed'));
  });
}

/**
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
function idbTransactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('idb_tx_failed'));
    tx.onabort = () => reject(tx.error ?? new Error('idb_tx_aborted'));
  });
}

/**
 * @param {string} videoId
 * @returns {Promise<CachedVideo | null>}
 */
async function getCachedVideo(videoId) {
  if (!videoId) return null;
  const db = await openVideoCacheDb();
  const tx = db.transaction(VIDEO_CACHE_STORE, 'readonly');
  const entry = await idbRequest(/** @type {IDBRequest<CachedVideo | undefined>} */ (tx.objectStore(VIDEO_CACHE_STORE).get(videoId)));
  await idbTransactionDone(tx);
  return entry ?? null;
}

/**
 * @param {Omit<CachedVideo, 'createdAt' | 'lastActiveAt' | 'leftAt'> & {
 *   createdAt?: number;
 *   lastActiveAt?: number;
 *   leftAt?: number | null;
 * }} entry
 */
async function putCachedVideo(entry) {
  const now = Date.now();
  /** @type {CachedVideo} */
  const record = {
    videoId: entry.videoId,
    youtubeUrl: entry.youtubeUrl,
    blob: entry.blob,
    createdAt: entry.createdAt ?? now,
    lastActiveAt: entry.lastActiveAt ?? now,
    leftAt: entry.leftAt === undefined ? null : entry.leftAt,
  };

  const db = await openVideoCacheDb();
  const tx = db.transaction(VIDEO_CACHE_STORE, 'readwrite');
  tx.objectStore(VIDEO_CACHE_STORE).put(record);
  await idbTransactionDone(tx);
  return record;
}

/**
 * @param {string} videoId
 * @returns {Promise<void>}
 */
async function deleteCachedVideo(videoId) {
  if (!videoId) return;
  const db = await openVideoCacheDb();
  const tx = db.transaction(VIDEO_CACHE_STORE, 'readwrite');
  tx.objectStore(VIDEO_CACHE_STORE).delete(videoId);
  await idbTransactionDone(tx);
}

/**
 * Mark a video as currently viewed — keep cache, clear expiry.
 * @param {string} videoId
 * @param {string} [youtubeUrl]
 */
async function markVideoActive(videoId, youtubeUrl) {
  const existing = await getCachedVideo(videoId);
  if (!existing) return null;

  return putCachedVideo({
    ...existing,
    youtubeUrl: youtubeUrl || existing.youtubeUrl,
    lastActiveAt: Date.now(),
    leftAt: null,
  });
}

/**
 * User left the watch page — start the 12h retention clock.
 * @param {string} videoId
 */
async function markVideoLeft(videoId) {
  const existing = await getCachedVideo(videoId);
  if (!existing) return null;

  return putCachedVideo({
    ...existing,
    leftAt: Date.now(),
  });
}

/**
 * Delete entries older than TTL from creation time — always, even if still active.
 * @param {number} [now]
 * @returns {Promise<string[]>} deleted videoIds
 */
async function purgeExpiredVideos(now = Date.now()) {
  const db = await openVideoCacheDb();
  const tx = db.transaction(VIDEO_CACHE_STORE, 'readwrite');
  const store = tx.objectStore(VIDEO_CACHE_STORE);
  const all = await idbRequest(/** @type {IDBRequest<CachedVideo[]>} */ (store.getAll()));
  /** @type {string[]} */
  const deleted = [];

  for (const entry of all) {
    const createdAt = entry.createdAt ?? entry.lastActiveAt ?? 0;
    if (now - createdAt >= VIDEO_CACHE_TTL_MS) {
      store.delete(entry.videoId);
      deleted.push(entry.videoId);
    }
  }

  await idbTransactionDone(tx);
  return deleted;
}

/**
 * Store a temporary clip blob (offscreen → SW handoff).
 * @param {string} key
 * @param {Blob} blob
 */
async function putTempBlob(key, blob) {
  const db = await openVideoCacheDb();
  const tx = db.transaction(VIDEO_CACHE_STORE, 'readwrite');
  tx.objectStore(VIDEO_CACHE_STORE).put({
    videoId: key,
    youtubeUrl: '',
    blob,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    leftAt: Date.now(),
  });
  await idbTransactionDone(tx);
}

/**
 * @param {string} key
 * @returns {Promise<Blob | null>}
 */
async function takeTempBlob(key) {
  const entry = await getCachedVideo(key);
  if (!entry) return null;
  await deleteCachedVideo(key);
  return entry.blob;
}

/**
 * Metadata for all cache entries (no blob transfer).
 * @returns {Promise<Array<{
 *   videoId: string;
 *   youtubeUrl: string;
 *   size: number;
 *   createdAt: number;
 *   lastActiveAt: number;
 *   leftAt: number | null;
 *   kind: 'video' | 'temp';
 * }>>}
 */
async function listCachedVideoMeta() {
  const db = await openVideoCacheDb();
  const tx = db.transaction(VIDEO_CACHE_STORE, 'readonly');
  const all = await idbRequest(/** @type {IDBRequest<CachedVideo[]>} */ (tx.objectStore(VIDEO_CACHE_STORE).getAll()));
  await idbTransactionDone(tx);

  return all.map((entry) => {
    const isTemp = entry.videoId.startsWith('clip-tmp:');
    return {
      videoId: entry.videoId,
      youtubeUrl: entry.youtubeUrl || '',
      size: entry.blob?.size ?? 0,
      createdAt: entry.createdAt ?? 0,
      lastActiveAt: entry.lastActiveAt ?? 0,
      leftAt: entry.leftAt ?? null,
      kind: /** @type {'video' | 'temp'} */ (isTemp ? 'temp' : 'video'),
    };
  });
}

/**
 * Wipe the entire video cache store.
 * @returns {Promise<{ deleted: number; freedBytes: number }>}
 */
async function clearAllCachedVideos() {
  const db = await openVideoCacheDb();
  const tx = db.transaction(VIDEO_CACHE_STORE, 'readwrite');
  const store = tx.objectStore(VIDEO_CACHE_STORE);
  const all = await idbRequest(/** @type {IDBRequest<CachedVideo[]>} */ (store.getAll()));
  let freedBytes = 0;
  for (const entry of all) {
    freedBytes += entry.blob?.size ?? 0;
  }
  store.clear();
  await idbTransactionDone(tx);
  return { deleted: all.length, freedBytes };
}

globalThis.VIDEO_CACHE_TTL_MS = VIDEO_CACHE_TTL_MS;
globalThis.getCachedVideo = getCachedVideo;
globalThis.putCachedVideo = putCachedVideo;
globalThis.deleteCachedVideo = deleteCachedVideo;
globalThis.markVideoActive = markVideoActive;
globalThis.markVideoLeft = markVideoLeft;
globalThis.purgeExpiredVideos = purgeExpiredVideos;
globalThis.putTempBlob = putTempBlob;
globalThis.takeTempBlob = takeTempBlob;
globalThis.listCachedVideoMeta = listCachedVideoMeta;
globalThis.clearAllCachedVideos = clearAllCachedVideos;
