import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clipExtensionFromMime as workerClipExtension } from './clip-format';
import { clipExtensionFromMime as sharedClipExtension } from '../../shared/clip-format.js';

describe('shared sync', () => {
  it('aligne clip-format worker et shared', () => {
    expect(workerClipExtension('video/mp4')).toBe(sharedClipExtension('video/mp4'));
    expect(workerClipExtension('video/webm')).toBe(sharedClipExtension('video/webm'));
  });

  it('aligne clip-format extension et shared', () => {
    const extensionSource = readFileSync(
      join(process.cwd(), 'extension/lib/clip-format.js'),
      'utf8',
    );
    expect(extensionSource).toContain("includes('mp4') ? 'mp4' : 'webm'");
  });
});
