const DEFAULT_DURATION = 90;

const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const statCount = document.getElementById('stat-count');
const statSize = document.getElementById('stat-size');
const statTtl = document.getElementById('stat-ttl');
const refreshBtn = document.getElementById('refresh-btn');
const clearAllBtn = document.getElementById('clear-all-btn');

const durationInput = document.getElementById('clip-duration');
const durationError = document.getElementById('duration-error');
const workerInput = document.getElementById('worker-url');
const workerError = document.getElementById('worker-error');
const galleryLink = document.getElementById('gallery-link');

/** @type {number} */
let ttlMs = 3 * 60 * 60 * 1000;

function showStatus(message) {
  statusEl.textContent = message;
  errorEl.hidden = true;
  window.clearTimeout(showStatus._timer);
  showStatus._timer = window.setTimeout(() => {
    statusEl.textContent = '';
  }, 2000);
}

function showError(message) {
  errorEl.hidden = false;
  errorEl.textContent = message;
  statusEl.textContent = '';
}

/** @param {number} bytes */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : n >= 10 ? 1 : 2;
  return `${n.toFixed(digits)} ${units[i]}`;
}

/** @param {number} ms */
function formatTtl(ms) {
  const h = Math.round(ms / (60 * 60 * 1000));
  if (h >= 1) return `${h} h`;
  return `${Math.round(ms / (60 * 1000))} min`;
}

/** @param {number} createdAt */
function formatExpiry(createdAt) {
  const expiresAt = (createdAt || Date.now()) + ttlMs;
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return 'Expiré';
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// —— Settings ——

async function loadSettings() {
  const {
    clipDuration = DEFAULT_DURATION,
    workerUrl = globalThis.CLIPPY_DEFAULT_WORKER_URL,
  } = await chrome.storage.sync.get(['clipDuration', 'workerUrl']);

  durationInput.value = formatDuration(clipDuration);
  workerInput.value = workerUrl || '';
  if (workerUrl) {
    galleryLink.href = workerUrl;
    galleryLink.hidden = false;
  }
}

function parseWorkerUrl(value) {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

async function saveWorkerUrl() {
  const parsed = parseWorkerUrl(workerInput.value);
  if (!parsed) {
    workerError.hidden = false;
    workerInput.classList.add('invalid');
    return;
  }
  workerError.hidden = true;
  workerInput.classList.remove('invalid');
  workerInput.value = parsed;
  await chrome.storage.sync.set({ workerUrl: parsed });
  galleryLink.href = parsed;
  galleryLink.hidden = false;
  showStatus('Enregistré');
}

async function saveDuration() {
  const parsed = parseDuration(durationInput.value);
  if (parsed === null || parsed > MAX_CLIP_DURATION_OPTION) {
    durationError.hidden = false;
    durationInput.classList.add('invalid');
    return;
  }
  durationError.hidden = true;
  durationInput.classList.remove('invalid');
  await chrome.storage.sync.set({ clipDuration: parsed });
  durationInput.value = formatDuration(parsed);
  showStatus('Enregistré');
}

durationInput.addEventListener('change', saveDuration);
durationInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveDuration();
  }
});

workerInput.addEventListener('change', saveWorkerUrl);
workerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveWorkerUrl();
  }
});

// —— Cache ——

/**
 * @param {Array<{
 *   videoId: string;
 *   youtubeUrl: string;
 *   size: number;
 *   createdAt: number;
 *   kind: 'video' | 'temp';
 * }>} entries
 */
function renderList(entries) {
  listEl.innerHTML = '';

  if (!entries.length) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  const sorted = [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'video' ? -1 : 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  for (const entry of sorted) {
    const li = document.createElement('li');
    li.className = 'item';

    const title =
      entry.kind === 'temp'
        ? entry.videoId
        : entry.youtubeUrl || entry.videoId;

    const link =
      entry.kind === 'video' && entry.youtubeUrl
        ? `<a href="${escapeHtml(entry.youtubeUrl)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>`
        : escapeHtml(title);

    li.innerHTML = `
      <div class="item-main">
        <div class="item-title">${link}</div>
        <div class="item-meta">
          <span class="badge badge-${entry.kind}">${entry.kind === 'temp' ? 'temp' : 'vidéo'}</span>
          <span>${formatBytes(entry.size)}</span>
          <span>${escapeHtml(formatExpiry(entry.createdAt))}</span>
        </div>
      </div>
      <button type="button" class="btn btn-ghost btn-small" data-delete="${escapeHtml(entry.videoId)}">
        Supprimer
      </button>
    `;
    listEl.appendChild(li);
  }
}

async function loadCache() {
  errorEl.hidden = true;
  clearAllBtn.disabled = true;
  refreshBtn.disabled = true;

  try {
    const result = await chrome.runtime.sendMessage({ type: 'LIST_CACHE' });
    if (!result?.ok) throw new Error(result?.error ?? 'list_failed');

    const entries = Array.isArray(result.entries) ? result.entries : [];
    if (result.ttlMs) {
      ttlMs = result.ttlMs;
      statTtl.textContent = formatTtl(result.ttlMs);
    }

    statCount.textContent = String(entries.length);
    statSize.textContent = formatBytes(result.totalBytes || 0);
    renderList(entries);
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
    statCount.textContent = '—';
    statSize.textContent = '—';
    listEl.innerHTML = '';
    emptyEl.hidden = false;
  } finally {
    clearAllBtn.disabled = false;
    refreshBtn.disabled = false;
  }
}

async function deleteEntry(videoId) {
  const result = await chrome.runtime.sendMessage({ type: 'DELETE_CACHE_ENTRY', videoId });
  if (!result?.ok) throw new Error(result?.error ?? 'delete_failed');
  showStatus('Supprimé');
  await loadCache();
}

async function clearAll() {
  if (!window.confirm('Vider tout le cache ?')) return;
  clearAllBtn.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'CLEAR_ALL_CACHES' });
    if (!result?.ok) throw new Error(result?.error ?? 'clear_failed');
    showStatus(`Vidé · ${formatBytes(result.freedBytes || 0)}`);
    await loadCache();
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    clearAllBtn.disabled = false;
  }
}

listEl.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const videoId = target.getAttribute('data-delete');
  if (!videoId) return;
  deleteEntry(videoId).catch((error) => {
    showError(error instanceof Error ? error.message : String(error));
  });
});

refreshBtn.addEventListener('click', () => loadCache());
clearAllBtn.addEventListener('click', () => clearAll());

loadSettings();
loadCache();
