import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

function installDomMock() {
  /** @type {Map<string, any>} */
  const attrs = new Map();
  /** @type {any[]} */
  const children = [];

  const el = {
    className: '',
    style: { cssText: '', border: '' },
    textContent: '',
    setAttribute(k, v) {
      attrs.set(k, v);
    },
    getAttribute(k) {
      return attrs.get(k) ?? null;
    },
    remove() {
      const i = children.indexOf(el);
      if (i >= 0) children.splice(i, 1);
    },
  };

  const body = {
    appendChild(node) {
      children.push(node);
      return node;
    },
    get innerHTML() {
      return children.length ? 'x' : '';
    },
    set innerHTML(_v) {
      children.length = 0;
      attrs.clear();
    },
  };

  globalThis.document = {
    body,
    documentElement: body,
    createElement() {
      attrs.clear();
      return el;
    },
    querySelector(sel) {
      if (sel === '[data-clippy-fallback-status]' && children.includes(el) && attrs.has('data-clippy-fallback-status')) {
        return el;
      }
      return null;
    },
  };
  return { el, children, attrs };
}

describe('status-badge', () => {
  /** @type {ReturnType<typeof installDomMock>} */
  let dom;

  beforeEach(() => {
    delete globalThis.clippyQueue;
    delete globalThis.showStatusBadge;
    delete globalThis.hideStatusBadge;
    vi.resetModules();
    dom = installDomMock();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('crée un fallback avec aria et auto-hide', async () => {
    vi.useFakeTimers();
    await import('../lib/status-badge.js');
    showStatusBadge('En cours');
    expect(dom.el.getAttribute('role')).toBe('status');
    expect(dom.el.getAttribute('aria-live')).toBe('polite');
    expect(dom.el.textContent).toBe('En cours');
    expect(dom.children).toHaveLength(1);

    vi.advanceTimersByTime(2300);
    expect(dom.children).toHaveLength(0);
  });

  it('sticky ne s’auto-cache pas ; hideStatusBadge nettoie', async () => {
    vi.useFakeTimers();
    await import('../lib/status-badge.js');
    showStatusBadge('Erreur', { variant: 'error', sticky: true });
    vi.advanceTimersByTime(10_000);
    expect(dom.el.textContent).toBe('Erreur');
    expect(dom.children).toHaveLength(1);
    hideStatusBadge();
    expect(dom.children).toHaveLength(0);
  });

  it('délègue à clippyQueue avec sticky', async () => {
    const setGlobalStatus = vi.fn();
    const clearGlobalStatus = vi.fn();
    globalThis.clippyQueue = { setGlobalStatus, clearGlobalStatus };
    await import('../lib/status-badge.js');

    showStatusBadge('OK', { sticky: true, variant: 'default' });
    expect(setGlobalStatus).toHaveBeenCalledWith('OK', { sticky: true, variant: 'default' });

    hideStatusBadge();
    expect(clearGlobalStatus).toHaveBeenCalled();
  });
});
