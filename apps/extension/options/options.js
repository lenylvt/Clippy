const DEFAULT_DURATION = 90;

const durationInput = document.getElementById('clip-duration');
const durationError = document.getElementById('duration-error');
const workerInput = document.getElementById('worker-url');
const workerError = document.getElementById('worker-error');
const deviceTokenEl = document.getElementById('device-token');
const resetTokenBtn = document.getElementById('reset-token');
const commandsLink = document.getElementById('commands-link');
const galleryLink = document.getElementById('gallery-link');
const status = document.getElementById('status');

function showStatus(message) {
  status.textContent = message;
  window.clearTimeout(showStatus._timer);
  showStatus._timer = window.setTimeout(() => {
    status.textContent = '';
  }, 1500);
}

async function loadSettings() {
  const {
    clipDuration = DEFAULT_DURATION,
    workerUrl = globalThis.CLIPPY_DEFAULT_WORKER_URL,
  } = await chrome.storage.sync.get(['clipDuration', 'workerUrl']);

  durationInput.value = formatDuration(clipDuration);
  workerInput.value = workerUrl;
  galleryLink.href = workerUrl;
  galleryLink.hidden = !workerUrl;

  const tokenRes = await chrome.runtime.sendMessage({ type: 'GET_DEVICE_TOKEN' });
  deviceTokenEl.textContent = tokenRes?.token ? `${tokenRes.token.slice(0, 12)}…` : '—';
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
  showStatus('Worker enregistré');
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
workerInput.addEventListener('change', saveWorkerUrl);
workerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveWorkerUrl();
  }
});
durationInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveDuration();
  }
});

resetTokenBtn.addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'RESET_DEVICE_TOKEN' });
  deviceTokenEl.textContent = res?.token ? `${res.token.slice(0, 12)}…` : '—';
  showStatus('Token régénéré');
});

commandsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

loadSettings();
