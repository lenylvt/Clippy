const DEFAULT_DURATION =
  typeof globalThis.DEFAULT_CLIP_DURATION === 'number'
    ? globalThis.DEFAULT_CLIP_DURATION
    : 90;

const MAX_DURATION =
  typeof globalThis.MAX_CLIP_SECONDS === 'number' ? globalThis.MAX_CLIP_SECONDS : 300;
const MIN_DURATION =
  typeof globalThis.MIN_CLIP_SECONDS === 'number' ? globalThis.MIN_CLIP_SECONDS : 3;

const { isAllowedWorkerUrl, isValidPairingDeepLink, normalizeWorkerBase } = globalThis;

const durationInput = /** @type {HTMLInputElement | null} */ (document.getElementById('clip-duration'));
const durationError = document.getElementById('duration-error');
const resetTokenBtn = document.getElementById('reset-token');
const commandsLink = document.getElementById('commands-link');
const status = document.getElementById('status');
const pairBlock = document.querySelector('.block[aria-labelledby="pair-title"]');
const pairStatus = document.getElementById('pair-status');
const pairBadge = document.getElementById('pair-badge');
const pairQrWrap = document.getElementById('pair-qr-wrap');
const pairQrCanvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('pair-qr-canvas'));
const pairRefresh = /** @type {HTMLButtonElement | null} */ (document.getElementById('pair-refresh'));
const pairUnlink = /** @type {HTMLButtonElement | null} */ (document.getElementById('pair-unlink'));
const pairExpire = document.getElementById('pair-expire');

if (
  !durationInput ||
  !durationError ||
  !resetTokenBtn ||
  !commandsLink ||
  !status ||
  !pairStatus ||
  !pairBadge ||
  !pairQrWrap ||
  !pairQrCanvas ||
  !pairRefresh ||
  !pairUnlink ||
  typeof isAllowedWorkerUrl !== 'function' ||
  typeof isValidPairingDeepLink !== 'function' ||
  typeof normalizeWorkerBase !== 'function'
) {
  throw new Error('options_dom_missing');
}

/** @type {number} */
let statusTimer = 0;
/** @type {number} */
let qrExpireTimer = 0;
/** @type {number} */
let pollTimer = 0;
/** @type {AbortController | null} */
let statusAbort = null;
/** @type {AbortController | null} */
let qrAbort = null;
/** @type {number} */
let requestGen = 0;
/** @type {boolean} */
let qrVisible = false;
/** @type {boolean} */
let wasPaired = false;

/**
 * @param {string} message
 */
function showStatus(message) {
  status.textContent = message;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    status.textContent = '';
  }, 1600);
}

function clearQrCanvas() {
  const ctx = pairQrCanvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, pairQrCanvas.width, pairQrCanvas.height);
}

function hideQr() {
  qrVisible = false;
  window.clearTimeout(qrExpireTimer);
  qrExpireTimer = 0;
  pairQrWrap.hidden = true;
  clearQrCanvas();
  if (pairExpire) {
    pairExpire.hidden = true;
    pairExpire.textContent = '';
  }
}

/**
 * @param {'loading' | 'paired' | 'unpaired' | 'error'} state
 * @param {string} label
 * @param {{ keepQr?: boolean }} [opts]
 */
function setPairUi(state, label, opts = {}) {
  pairBlock?.setAttribute('data-state', state);
  pairStatus.textContent = label;
  const paired = state === 'paired';
  const loading = state === 'loading';
  const unpaired = state === 'unpaired';

  pairBadge.hidden = !paired;
  pairUnlink.hidden = !paired;

  if (paired || state === 'error') {
    hideQr();
    pairRefresh.hidden = true;
  } else if (unpaired) {
    if (!opts.keepQr) {
      hideQr();
      pairRefresh.hidden = false;
      pairRefresh.textContent = 'Afficher le QR';
    } else {
      pairRefresh.hidden = false;
      pairRefresh.textContent = 'Rafraîchir le QR';
    }
  } else {
    // loading
    pairRefresh.hidden = true;
    hideQr();
  }

  pairRefresh.disabled = loading;
  pairUnlink.disabled = loading || pairUnlink.hidden;
}

/**
 * Draw QR on canvas only (no <img> — avoids broken-image placeholder).
 * @param {string} deepLink
 * @returns {boolean}
 */
function renderLocalQr(deepLink) {
  const make = typeof globalThis.qrcode === 'function' ? globalThis.qrcode : null;
  if (!make) return false;

  const qr = make(0, 'M');
  qr.addData(deepLink);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const margin = 2;
  const target = 168;
  const cell = Math.max(2, Math.floor(target / (moduleCount + margin * 2)));
  const size = cell * (moduleCount + margin * 2);

  pairQrCanvas.width = size;
  pairQrCanvas.height = size;
  const ctx = pairQrCanvas.getContext('2d');
  if (!ctx) return false;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect((col + margin) * cell, (row + margin) * cell, cell, cell);
      }
    }
  }
  return true;
}

/**
 * @param {number} expiresAtMs
 */
function startQrExpiry(expiresAtMs) {
  window.clearTimeout(qrExpireTimer);
  const tick = () => {
    const left = expiresAtMs - Date.now();
    if (left <= 0) {
      hideQr();
      pairRefresh.hidden = false;
      pairRefresh.textContent = 'Afficher le QR';
      pairStatus.textContent = 'QR expiré — génère-en un nouveau.';
      pairBlock?.setAttribute('data-state', 'unpaired');
      showStatus('QR expiré');
      return;
    }
    if (pairExpire) {
      const sec = Math.ceil(left / 1000);
      pairExpire.hidden = false;
      pairExpire.textContent = `Expire dans ${sec}s`;
    }
    qrExpireTimer = window.setTimeout(tick, Math.min(1000, left));
  };
  tick();
}

async function getWorkerUrl() {
  const { workerUrl = globalThis.CLIPPY_DEFAULT_WORKER_URL } = await chrome.storage.sync.get([
    'workerUrl',
  ]);
  const candidate = workerUrl || globalThis.CLIPPY_DEFAULT_WORKER_URL;
  if (!isAllowedWorkerUrl(candidate)) {
    return normalizeWorkerBase(String(globalThis.CLIPPY_DEFAULT_WORKER_URL));
  }
  return normalizeWorkerBase(String(candidate));
}

/**
 * @param {string} path
 * @param {RequestInit & { signal?: AbortSignal }} [init]
 */
async function deviceApi(path, init = {}) {
  const workerUrl = await getWorkerUrl();
  const tokenRes = await chrome.runtime.sendMessage({ type: 'GET_DEVICE_TOKEN' });
  if (tokenRes && tokenRes.ok === false) {
    const err = new Error(tokenRes.error || 'token_error');
    err.name = 'TokenError';
    throw err;
  }
  const token = tokenRes?.token;
  if (!token) {
    const err = new Error('missing_token');
    err.name = 'TokenError';
    throw err;
  }

  const res = await fetch(`${workerUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { res, data, token };
}

async function loadSettings() {
  setPairUi('loading', 'Vérification…');
  const { clipDuration = DEFAULT_DURATION } = await chrome.storage.sync.get(['clipDuration']);
  durationInput.value = formatDuration(clipDuration);
  await refreshPairingStatus();
  schedulePoll();
}

async function refreshPairingStatus() {
  statusAbort?.abort();
  const ac = new AbortController();
  statusAbort = ac;
  const gen = ++requestGen;

  try {
    const { res, data } = await deviceApi('/api/pairing/status', { signal: ac.signal });
    if (gen !== requestGen) return;

    if (!res.ok) {
      setPairUi(
        'error',
        res.status === 401
          ? 'Identité refusée — réinitialise dans Avancé.'
          : 'Impossible de vérifier la liaison.',
      );
      return;
    }

    if (data?.paired) {
      if (!wasPaired) showStatus('Connecté');
      wasPaired = true;
      setPairUi('paired', 'Prêt à envoyer des clips.');
    } else {
      wasPaired = false;
      const keep = qrVisible;
      setPairUi('unpaired', 'Scanne le QR dans l’app pour lier cet Chrome.', { keepQr: keep });
      if (keep) {
        pairQrWrap.hidden = false;
      }
    }
  } catch (error) {
    if (/** @type {Error} */ (error).name === 'AbortError') return;
    if (gen !== requestGen) return;
    if (/** @type {Error} */ (error).name === 'TokenError') {
      setPairUi('error', 'Identité locale manquante — réinitialise dans Avancé.');
      return;
    }
    setPairUi('error', 'Impossible de vérifier la liaison.');
  }
}

async function showPairingQr() {
  qrAbort?.abort();
  const ac = new AbortController();
  qrAbort = ac;
  const gen = ++requestGen;

  pairRefresh.disabled = true;
  try {
    const { res, data } = await deviceApi('/api/pairing/start', {
      method: 'POST',
      signal: ac.signal,
    });
    if (gen !== requestGen) return;

    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `http_${res.status}`);
    }
    if (!isValidPairingDeepLink(data.deepLink)) {
      throw new Error('invalid_deep_link');
    }

    const expiresAt =
      typeof data.expiresAt === 'number' && Number.isFinite(data.expiresAt)
        ? data.expiresAt
        : Date.now() + 120_000;

    if (!renderLocalQr(data.deepLink)) {
      throw new Error('qr_render_failed');
    }

    qrVisible = true;
    pairQrWrap.hidden = false;
    pairStatus.textContent = 'Scanne ce QR dans l’app.';
    pairBlock?.setAttribute('data-state', 'unpaired');
    pairBadge.hidden = true;
    pairUnlink.hidden = true;
    pairRefresh.hidden = false;
    pairRefresh.textContent = 'Rafraîchir le QR';
    startQrExpiry(expiresAt);
  } catch (error) {
    if (/** @type {Error} */ (error).name === 'AbortError') return;
    const code = error instanceof Error ? error.message : 'pairing_failed';
    showStatus(`Échec QR (${code})`);
    hideQr();
    pairRefresh.hidden = false;
    pairRefresh.textContent = 'Afficher le QR';
  } finally {
    pairRefresh.disabled = false;
  }
}

async function unlinkPairing() {
  if (!window.confirm('Délier cet Chrome de l’app iPhone ?')) return;

  pairUnlink.disabled = true;
  try {
    const { res, data } = await deviceApi('/api/pairing/unlink', { method: 'POST' });
    if (!res.ok || !data?.ok) throw new Error(data?.error || `http_${res.status}`);
    hideQr();
    wasPaired = false;
    showStatus('Délié');
    await refreshPairingStatus();
  } catch (error) {
    const code = error instanceof Error ? error.message : 'unlink_failed';
    showStatus(`Échec déliaison (${code})`);
  } finally {
    pairUnlink.disabled = false;
  }
}

async function saveDuration() {
  const parsed = parseDuration(durationInput.value);
  if (parsed === null || parsed < MIN_DURATION || parsed > MAX_DURATION) {
    durationError.hidden = false;
    durationError.textContent = `Durée invalide (${formatDuration(MIN_DURATION)}–${formatDuration(MAX_DURATION)})`;
    durationInput.classList.add('invalid');
    return;
  }

  durationError.hidden = true;
  durationInput.classList.remove('invalid');
  await chrome.storage.sync.set({ clipDuration: parsed });
  durationInput.value = formatDuration(parsed);
  showStatus('Enregistré');
}

async function resetIdentity() {
  if (
    !window.confirm(
      'Réinitialiser l’identité locale ? Cela délie aussi l’app si elle était connectée.',
    )
  ) {
    return;
  }

  resetTokenBtn.setAttribute('disabled', 'true');
  try {
    try {
      await deviceApi('/api/pairing/unlink', { method: 'POST' });
    } catch {
      /* best-effort unlink before rotate */
    }
    await chrome.runtime.sendMessage({ type: 'RESET_DEVICE_TOKEN' });
    hideQr();
    wasPaired = false;
    showStatus('Identité réinitialisée');
    await refreshPairingStatus();
  } finally {
    resetTokenBtn.removeAttribute('disabled');
  }
}

function schedulePoll() {
  window.clearTimeout(pollTimer);
  const paired = pairBlock?.getAttribute('data-state') === 'paired';
  const hidden = document.visibilityState === 'hidden';
  const delay = hidden ? 30_000 : paired ? 12_000 : 5_000;
  pollTimer = window.setTimeout(() => {
    void refreshPairingStatus().finally(schedulePoll);
  }, delay);
}

durationInput.addEventListener('change', () => void saveDuration());
resetTokenBtn.addEventListener('click', () => void resetIdentity());
pairRefresh.addEventListener('click', () => void showPairingQr());
pairUnlink.addEventListener('click', () => void unlinkPairing());
commandsLink.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    void refreshPairingStatus();
    schedulePoll();
  }
});

loadSettings();
