import { describe, expect, it, beforeEach, vi } from 'vitest';
import '../lib/log.js';

function installPlayerDom() {
  class El {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.attrs = {};
      this.className = '';
      this.parentElement = null;
      this.isConnected = true;
      this._html = '';
    }
    setAttribute(k, v) {
      this.attrs[k] = String(v);
    }
    getAttribute(k) {
      return this.attrs[k] ?? null;
    }
    querySelector(sel) {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return this.children.find((c) => String(c.className).includes(cls)) || null;
      }
      return null;
    }
    insertBefore(node, anchor) {
      node.parentElement = this;
      const i = this.children.indexOf(anchor);
      if (i >= 0) this.children.splice(i, 0, node);
      else this.children.push(node);
      return node;
    }
    appendChild(node) {
      node.parentElement = this;
      this.children.push(node);
      return node;
    }
    insertAdjacentHTML(_pos, html) {
      this._html = html;
    }
    addEventListener() {}
    removeEventListener() {}
    remove() {
      this.isConnected = false;
      if (this.parentElement) {
        this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
      }
    }
  }

  const controls = new El('div');
  controls.className = 'ytp-right-controls';
  const fullscreen = new El('button');
  fullscreen.className = 'ytp-fullscreen-button';
  controls.appendChild(fullscreen);

  const movie = new El('div');
  movie.id = 'movie_player';

  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };

  globalThis.document = {
    documentElement: new El('html'),
    querySelector(sel) {
      if (sel === '.ytp-fullscreen-button') return fullscreen;
      if (sel === '.ytp-right-controls') return controls;
      if (sel === '.ytp-clippy-button') {
        return (
          controls.children.find((c) => String(c.className).includes('ytp-clippy-button')) || null
        );
      }
      if (sel === '#movie_player') return movie;
      if (sel === '#ytd-player') return null;
      return null;
    },
    createElement(tag) {
      return new El(tag);
    },
    addEventListener() {},
    removeEventListener() {},
  };

  globalThis.window = globalThis;
  window.setTimeout = (fn) => {
    fn();
    return 1;
  };
  window.clearTimeout = () => {};

  return { controls, fullscreen };
}

describe('player-button', () => {
  /** @type {{ controls: any; fullscreen: any }} */
  let dom;

  beforeEach(() => {
    dom = installPlayerDom();
    vi.resetModules();
  });

  it('injecte le bouton avant le plein écran et expose destroy', async () => {
    await import('../content/player-button.js');
    const onClick = vi.fn();
    const api = injectPlayerButton(onClick);

    const btn = api.getButton();
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('data-clippy-player-button')).toBe('1');
    expect(btn.getAttribute('aria-label')).toBe('Clipper avec Clippy');
    expect(btn.getAttribute('title')).toBe('Clipper avec Clippy');

    expect(dom.controls.children.indexOf(btn)).toBeLessThan(
      dom.controls.children.indexOf(dom.fullscreen),
    );

    api.setOpen(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Fermer Clippy');

    api.destroy();
    expect(api.getButton()).toBeNull();
  });

  it('findPlayerControls préfère le parent du fullscreen', async () => {
    await import('../content/player-button.js');
    const controls = findPlayerControls();
    expect(controls).toBe(dom.fullscreen.parentElement);
  });
});
