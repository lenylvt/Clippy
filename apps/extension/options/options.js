const DEFAULT_DURATION = 90;

const durationInput = document.getElementById('clip-duration');
const durationError = document.getElementById('duration-error');
const resetTokenBtn = document.getElementById('reset-token');
const commandsLink = document.getElementById('commands-link');
const status = document.getElementById('status');
const pairBlock = document.querySelector('.block[aria-labelledby="pair-title"]');
const pairStatus = document.getElementById('pair-status');
const pairBadge = document.getElementById('pair-badge');
const pairQrWrap = document.getElementById('pair-qr-wrap');
const pairQr = document.getElementById('pair-qr');
const pairRefresh = document.getElementById('pair-refresh');
const pairUnlink = document.getElementById('pair-unlink');

function showStatus(message) {
  status.textContent = message;
  window.clearTimeout(showStatus._timer);
  showStatus._timer = window.setTimeout(() => {
    status.textContent = '';
  }, 1600);
}

/**
 * @param {'loading' | 'paired' | 'unpaired' | 'error'} state
 * @param {string} label
 */
function setPairUi(state, label) {
  pairBlock?.setAttribute('data-state', state);
  pairStatus.textContent = label;
  const paired = state === 'paired';
  pairBadge.hidden = !paired;
  pairUnlink.hidden = !paired;
  if (paired) {
    pairQrWrap.hidden = true;
    pairQr.removeAttribute('src');
    pairRefresh.hidden = true;
  } else {
    pairRefresh.hidden = false;
    pairRefresh.textContent = 'Afficher le QR';
  }
}

async function getWorkerUrl() {
  const { workerUrl = globalThis.CLIPPY_DEFAULT_WORKER_URL } = await chrome.storage.sync.get(['workerUrl']);
  return workerUrl || globalThis.CLIPPY_DEFAULT_WORKER_URL;
}

async function loadSettings() {
  const { clipDuration = DEFAULT_DURATION } = await chrome.storage.sync.get(['clipDuration']);
  durationInput.value = formatDuration(clipDuration);
  await refreshPairingStatus();
}

async function refreshPairingStatus() {
  const workerUrl = await getWorkerUrl();
  const tokenRes = await chrome.runtime.sendMessage({ type: 'GET_DEVICE_TOKEN' });
  const token = tokenRes?.token;
  if (!token) {
    setPairUi('error', 'Identité locale manquante — réinitialise dans Avancé.');
    return;
  }
  try {
    const res = await fetch(`${workerUrl}/api/pairing/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data?.paired) {
      setPairUi('paired', 'Prêt à envoyer des clips.');
    } else {
      const qrOpen = !pairQrWrap.hidden && Boolean(pairQr.getAttribute('src'));
      setPairUi('unpaired', 'Scanne le QR dans l’app pour lier cet Chrome.');
      if (qrOpen) {
        pairQrWrap.hidden = false;
        pairRefresh.textContent = 'Rafraîchir le QR';
      }
    }
  } catch {
    setPairUi('error', 'Impossible de vérifier la liaison.');
  }
}

async function showPairingQr() {
  const workerUrl = await getWorkerUrl();
  const tokenRes = await chrome.runtime.sendMessage({ type: 'GET_DEVICE_TOKEN' });
  const token = tokenRes?.token;
  if (!token) {
    showStatus('Identité manquante');
    return;
  }
  pairRefresh.disabled = true;
  try {
    const res = await fetch(`${workerUrl}/api/pairing/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || 'pairing_failed');
    }
    pairQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=6&data=${encodeURIComponent(data.deepLink)}`;
    pairQrWrap.hidden = false;
    pairStatus.textContent = 'Scanne ce QR dans l’app (2 min).';
    pairBlock?.setAttribute('data-state', 'unpaired');
    pairBadge.hidden = true;
    pairRefresh.textContent = 'Rafraîchir le QR';
    showStatus('QR prêt');
  } catch {
    showStatus('Échec QR');
  } finally {
    pairRefresh.disabled = false;
  }
}

async function unlinkPairing() {
  const workerUrl = await getWorkerUrl();
  const tokenRes = await chrome.runtime.sendMessage({ type: 'GET_DEVICE_TOKEN' });
  const token = tokenRes?.token;
  if (!token) return;
  pairUnlink.disabled = true;
  try {
    const res = await fetch(`${workerUrl}/api/pairing/unlink`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error(data?.error || 'unlink_failed');
    pairQrWrap.hidden = true;
    pairQr.removeAttribute('src');
    showStatus('Délié');
    await refreshPairingStatus();
  } catch {
    showStatus('Échec déliaison');
  } finally {
    pairUnlink.disabled = false;
  }
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
resetTokenBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'RESET_DEVICE_TOKEN' });
  pairQrWrap.hidden = true;
  pairQr.removeAttribute('src');
  showStatus('Identité réinitialisée');
  await refreshPairingStatus();
});
pairRefresh.addEventListener('click', showPairingQr);
pairUnlink.addEventListener('click', () => void unlinkPairing());
commandsLink.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

loadSettings();
setInterval(() => void refreshPairingStatus(), 5000);
