import { describe, expect, it } from 'vitest';
import './shortcut.js';

const { formatShortcut, matchesShortcut, parseShortcut } = globalThis;

describe('parseShortcut', () => {
  it('parses key only', () => {
    expect(parseShortcut('s')).toEqual({
      alt: false, ctrl: false, meta: false, shift: false, key: 's',
    });
  });

  it('parses modifiers', () => {
    expect(parseShortcut('ctrl+shift+c')).toEqual({
      alt: false, ctrl: true, meta: false, shift: true, key: 'c',
    });
    expect(parseShortcut('ctrl+shift+k')).toEqual({
      alt: false, ctrl: true, meta: false, shift: true, key: 'k',
    });
  });

  it('rejects invalid shortcuts', () => {
    expect(parseShortcut('')).toBeNull();
    expect(parseShortcut('shift')).toBeNull();
  });
});

describe('formatShortcut', () => {
  it('formats shortcut', () => {
    expect(formatShortcut({ alt: false, ctrl: true, meta: false, shift: true, key: 'c' })).toBe('ctrl+shift+c');
  });
});

describe('matchesShortcut', () => {
  it('matches keyboard events', () => {
    const shortcut = parseShortcut('ctrl+shift+c');
    const event = {
      key: 'c',
      code: 'KeyC',
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
    };
    expect(matchesShortcut(/** @type {KeyboardEvent} */ (event), shortcut)).toBe(true);
  });
});
