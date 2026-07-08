/** @typedef {{ alt: boolean; ctrl: boolean; meta: boolean; shift: boolean; key: string }} Shortcut */

const MODIFIERS = ['ctrl', 'alt', 'shift', 'meta'];
const DEFAULT_SHORTCUT = 'shift+c';

/** @param {string} value */
function parseShortcut(value) {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;

  const parts = raw.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const key = parts[parts.length - 1];
  if (!key || key.length === 0) return null;

  /** @type {Shortcut} */
  const shortcut = { alt: false, ctrl: false, meta: false, shift: false, key };

  for (const part of parts.slice(0, -1)) {
    if (part === 'control') shortcut.ctrl = true;
    else if (part === 'cmd' || part === 'command' || part === '⌘') shortcut.meta = true;
    else if (MODIFIERS.includes(part)) shortcut[/** @type {'alt'|'ctrl'|'meta'|'shift'} */ (part)] = true;
    else return null;
  }

  if (['ctrl', 'alt', 'shift', 'meta', 'control', 'cmd', 'command'].includes(key)) return null;
  return shortcut;
}

/** @param {Shortcut} shortcut */
function formatShortcut(shortcut) {
  const parts = [];
  if (shortcut.ctrl) parts.push('ctrl');
  if (shortcut.alt) parts.push('alt');
  if (shortcut.shift) parts.push('shift');
  if (shortcut.meta) parts.push('meta');
  parts.push(shortcut.key);
  return parts.join('+');
}

/** @param {KeyboardEvent} event @param {Shortcut} shortcut */
function matchesShortcut(event, shortcut) {
  if (event.altKey !== shortcut.alt) return false;
  if (event.ctrlKey !== shortcut.ctrl) return false;
  if (event.metaKey !== shortcut.meta) return false;
  if (event.shiftKey !== shortcut.shift) return false;

  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  const wantedKey = shortcut.key.length === 1 ? shortcut.key.toLowerCase() : shortcut.key.toLowerCase();

  if (eventKey === wantedKey) return true;

  const codeMap = {
    KeyA: 'a', KeyB: 'b', KeyC: 'c', KeyD: 'd', KeyE: 'e', KeyF: 'f',
    KeyG: 'g', KeyH: 'h', KeyI: 'i', KeyJ: 'j', KeyK: 'k', KeyL: 'l',
    KeyM: 'm', KeyN: 'n', KeyO: 'o', KeyP: 'p', KeyQ: 'q', KeyR: 'r',
    KeyS: 's', KeyT: 't', KeyU: 'u', KeyV: 'v', KeyW: 'w', KeyX: 'x',
    KeyY: 'y', KeyZ: 'z', Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3',
    Digit4: '4', Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
  };

  const fromCode = codeMap[event.code];
  return fromCode === wantedKey;
}

/** @param {KeyboardEvent} event */
function shortcutFromKeyboardEvent(event) {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return null;

  return {
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey,
    key: event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase(),
  };
}

/** @param {KeyboardEvent} event */
function isGlobalOpenShortcut(event) {
  return event.code === 'KeyC' && event.shiftKey && event.ctrlKey && !event.metaKey && !event.altKey;
}

/** @param {KeyboardEvent} event */
function isGlobalOpenShortcutMacCommand(event) {
  return event.code === 'KeyC' && event.shiftKey && event.metaKey && !event.ctrlKey && !event.altKey;
}

globalThis.isGlobalOpenShortcut = isGlobalOpenShortcut;
globalThis.isGlobalOpenShortcutMacCommand = isGlobalOpenShortcutMacCommand;
globalThis.parseShortcut = parseShortcut;
globalThis.formatShortcut = formatShortcut;
globalThis.matchesShortcut = matchesShortcut;
globalThis.shortcutFromKeyboardEvent = shortcutFromKeyboardEvent;
globalThis.DEFAULT_SHORTCUT = DEFAULT_SHORTCUT;
