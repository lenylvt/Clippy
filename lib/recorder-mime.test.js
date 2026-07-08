import { describe, expect, it } from 'vitest';
import './recorder-mime.js';

describe('pickRecorderMimeType', () => {
  it('prefers vp8 webm when supported', () => {
    const original = globalThis.MediaRecorder;
    globalThis.MediaRecorder = {
      isTypeSupported: (type) => type.startsWith('video/webm'),
    };

    expect(pickRecorderMimeType()).toBe('video/webm;codecs=vp8,opus');

    globalThis.MediaRecorder = original;
  });
});
