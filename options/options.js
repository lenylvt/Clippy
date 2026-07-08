const DEFAULT_DURATION = 90;

const durationInput = document.getElementById('clip-duration');
const durationError = document.getElementById('duration-error');
const shortcutBtn = document.getElementById('shortcut');
const shortcutLabel = document.getElementById('shortcut-label');
const shortcutError = document.getElementById('shortcut-error');
const commandsLink = document.getElementById('commands-link');
const status = document.getElementById('status');

/** @type {ReturnType<typeof parseShortcut>} */
let currentShortcut = parseShortcut(DEFAULT_SHORTCUT);

function showStatus(message) {
  status.textContent = message;
  window.clearTimeout(showStatus._timer);
  showStatus._timer = window.setTimeout(() => {
    status.textContent = '';
  }, 1500);
}

function renderShortcut() {
  if (currentShortcut) {
    shortcutLabel.textContent = formatShortcut(currentShortcut);
    shortcutError.hidden = true;
    shortcutBtn.classList.remove('invalid', 'recording');
  }
}

async function loadSettings() {
  const { clipDuration = DEFAULT_DURATION, shortcut = DEFAULT_SHORTCUT } = await chrome.storage.sync.get([
    'clipDuration',
    'shortcut',
  ]);

  durationInput.value = formatDuration(clipDuration);
  currentShortcut = parseShortcut(shortcut) ?? parseShortcut(DEFAULT_SHORTCUT);
  renderShortcut();
}

async function saveDuration() {
  const parsed = parseDuration(durationInput.value);
  if (parsed === null) {
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

async function saveShortcut() {
  if (!currentShortcut) {
    shortcutError.hidden = false;
    shortcutBtn.classList.add('invalid');
    return;
  }

  await chrome.storage.sync.set({ shortcut: formatShortcut(currentShortcut) });
  renderShortcut();
  showStatus('Raccourci enregistré');
}

durationInput.addEventListener('change', saveDuration);
durationInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveDuration();
  }
});

shortcutBtn.addEventListener('click', () => {
  shortcutBtn.classList.add('recording');
  shortcutLabel.textContent = 'Appuie sur une touche…';
});

shortcutBtn.addEventListener('keydown', (e) => {
  if (!shortcutBtn.classList.contains('recording')) return;

  e.preventDefault();
  e.stopPropagation();

  const captured = shortcutFromKeyboardEvent(e);
  if (!captured) return;

  currentShortcut = captured;
  shortcutBtn.classList.remove('recording');
  saveShortcut();
});

commandsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

loadSettings();
