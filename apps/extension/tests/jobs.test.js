import { describe, expect, it } from 'vitest';

// Mirror of jobs.js stage mapping for unit tests without chrome globals.
function stageToQueueStatus(stage) {
  switch (stage) {
    case 'queued':
      return 'queued';
    case 'downloading':
      return 'download';
    case 'cropping':
      return 'crop';
    case 'uploading':
      return 'upload';
    case 'done':
      return 'done';
    case 'error':
      return 'error';
    default:
      return 'queued';
  }
}

describe('jobs stage mapping', () => {
  it('mappe les stages serveur vers la queue UI', () => {
    expect(stageToQueueStatus('queued')).toBe('queued');
    expect(stageToQueueStatus('downloading')).toBe('download');
    expect(stageToQueueStatus('cropping')).toBe('crop');
    expect(stageToQueueStatus('uploading')).toBe('upload');
    expect(stageToQueueStatus('done')).toBe('done');
    expect(stageToQueueStatus('error')).toBe('error');
  });
});
