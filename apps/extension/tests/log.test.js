import { describe, expect, it, vi } from 'vitest';
import '../lib/log.js';

describe('clippyLog', () => {
  it('prefixes messages with scope and step', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    clippyLog('test', 'hello', { ok: true });
    expect(spy).toHaveBeenCalledWith('[Clippy][test] hello {"ok":true}');
    spy.mockRestore();
  });
});
