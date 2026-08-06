import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

describe('clippyLog', () => {
  beforeEach(() => {
    globalThis.CLIPPY_DEBUG = true;
    vi.resetModules();
  });

  afterEach(() => {
    delete globalThis.CLIPPY_DEBUG;
  });

  it('prefixes messages with scope and step when debug on', async () => {
    await import('../lib/log.js');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    clippyLog('test', 'hello', { ok: true });
    expect(spy).toHaveBeenCalledWith('[Clippy][test] hello {"ok":true}');
    spy.mockRestore();
  });

  it('ne log pas si debug off', async () => {
    globalThis.CLIPPY_DEBUG = false;
    await import('../lib/log.js');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    clippyLog('test', 'silent');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
