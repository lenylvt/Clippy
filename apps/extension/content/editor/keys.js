/**
 * @typedef {{
 *   isOpen: () => boolean;
 *   close: () => void;
 *   triggerSave: () => void;
 *   togglePlay: () => void;
 *   removeActiveClip?: () => void;
 * }} EditorKeysApi
 */

/** @param {EventTarget | null} target */
function isEditableKeyTarget(target) {
  if (!target || typeof target !== 'object') return false;

  const tag =
    typeof Element !== 'undefined' && target instanceof Element
      ? target
      : null;

  if (tag) {
    if (
      typeof HTMLInputElement !== 'undefined' &&
      tag instanceof HTMLInputElement &&
      !tag.disabled &&
      !tag.readOnly
    ) {
      return true;
    }
    if (
      typeof HTMLTextAreaElement !== 'undefined' &&
      tag instanceof HTMLTextAreaElement &&
      !tag.disabled &&
      !tag.readOnly
    ) {
      return true;
    }
    if (
      typeof HTMLSelectElement !== 'undefined' &&
      tag instanceof HTMLSelectElement &&
      !tag.disabled
    ) {
      return true;
    }
    if (tag instanceof HTMLElement && tag.isContentEditable) return true;
    return Boolean(tag.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
  }

  if (typeof /** @type {{ closest?: Function }} */ (target).closest === 'function') {
    return Boolean(
      /** @type {{ closest: (s: string) => unknown }} */ (target).closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
      ),
    );
  }
  return false;
}

/**
 * @param {EditorKeysApi} api
 * @returns {{ onKeyDown: (e: KeyboardEvent) => void; onKeyUp: (e: KeyboardEvent) => void }}
 */
function createEditorKeyHandlers(api) {
  const onKeyDown = (e) => {
    if (!api.isOpen()) return;
    if (e.isComposing) return;
    if (isEditableKeyTarget(e.target)) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      api.close();
      return;
    }

    if (e.key === 'Enter' && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      api.triggerSave();
      return;
    }

    if ((e.key === ' ' || e.code === 'Space') && !e.repeat) {
      e.preventDefault();
      e.stopImmediatePropagation();
      api.togglePlay();
      return;
    }

    if ((e.key === 'Backspace' || e.key === 'Delete') && typeof api.removeActiveClip === 'function') {
      e.preventDefault();
      e.stopImmediatePropagation();
      api.removeActiveClip();
    }
  };

  const onKeyUp = () => {};

  return { onKeyDown, onKeyUp };
}

/**
 * @param {EditorKeysApi} api
 * @returns {() => void} unbind
 */
function bindEditorKeys(api) {
  const { onKeyDown, onKeyUp } = createEditorKeyHandlers(api);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);
  return () => {
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keyup', onKeyUp, true);
  };
}

globalThis.isEditableKeyTarget = isEditableKeyTarget;
globalThis.createEditorKeyHandlers = createEditorKeyHandlers;
globalThis.bindEditorKeys = bindEditorKeys;
