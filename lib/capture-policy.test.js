import { describe, expect, it } from 'vitest';
import './capture-policy.js';

describe('capture policy', () => {
  it('allows priming only after extension invocation', () => {
    expect(canPrimeCapture('command')).toBe(true);
    expect(canPrimeCapture('action')).toBe(true);
    expect(canPrimeCapture('save_click')).toBe(false);
  });

  it('returns a helpful error when capture was not authorized', () => {
    expect(captureNotAuthorizedResponse('save_click')).toEqual({
      ok: false,
      error: 'capture_not_authorized',
      source: 'save_click',
      hint: 'Clique l’icône Clippy ou utilise Ctrl+Shift+C avant de sauver.',
    });
  });
});
