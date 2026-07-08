import { describe, expect, it } from 'vitest';
import './recorder-mime.js';

describe('pickRecorderMimeType', () => {
  it('prefère mp4 quand supporté', () => {
    const original = globalThis.MediaRecorder;
    globalThis.MediaRecorder = {
      isTypeSupported: (type) => type === 'video/mp4' || type.startsWith('video/webm'),
    };

    expect(pickRecorderMimeType()).toBe('video/mp4');

    globalThis.MediaRecorder = original;
  });

  it('prefers vp8 webm when mp4 unsupported', () => {
    const original = globalThis.MediaRecorder;
    globalThis.MediaRecorder = {
      isTypeSupported: (type) => type.startsWith('video/webm'),
    };

    expect(pickRecorderMimeType()).toBe('video/webm;codecs=vp8,opus');

    globalThis.MediaRecorder = original;
  });
});
