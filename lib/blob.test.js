import { describe, expect, it, vi } from 'vitest';
import './blob.js';

describe('blobToDataUrl', () => {
  it('encodes a blob as a data url', async () => {
    class MockFileReader {
      result = '';
      onload = null;
      onerror = null;
      readAsDataURL() {
        this.result = 'data:text/plain;base64,Y2xpcA==';
        this.onload?.();
      }
    }

    vi.stubGlobal('FileReader', MockFileReader);

    const dataUrl = await blobToDataUrl(new Blob(['clip'], { type: 'text/plain' }));
    expect(dataUrl).toBe('data:text/plain;base64,Y2xpcA==');

    vi.unstubAllGlobals();
  });
});

describe('arrayBufferToDataUrl', () => {
  it('encodes bytes for service worker downloads', () => {
    const buffer = new TextEncoder().encode('clip').buffer;
    const dataUrl = arrayBufferToDataUrl(buffer, 'video/webm');
    expect(dataUrl.startsWith('data:video/webm;base64,')).toBe(true);
  });

  it('strips codec parameters that break chrome.downloads data urls', () => {
    const buffer = new TextEncoder().encode('x').buffer;
    const dataUrl = arrayBufferToDataUrl(buffer, 'video/webm;codecs=vp8,opus');
    expect(dataUrl.startsWith('data:video/webm;base64,')).toBe(true);
    expect(dataUrl.includes('opus')).toBe(false);
  });
});
