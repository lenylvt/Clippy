import { describe, expect, it } from 'vitest';
import { queueBarWidth, stageToQueueStatus } from '../src/stages';

describe('queueBarWidth', () => {
  it('suit le pourcentage pendant le téléchargement', () => {
    expect(queueBarWidth('download', 0.42)).toBe(42);
    expect(queueBarWidth('download', 0.99)).toBe(99);
  });

  it('atteint 100% une fois terminé', () => {
    expect(queueBarWidth('done', 1)).toBe(100);
    expect(queueBarWidth('error', 0.2)).toBe(100);
  });

  it('garde un minimum visible en attente', () => {
    expect(queueBarWidth('queued', 0)).toBe(4);
    expect(queueBarWidth('preparing', 0)).toBe(8);
  });
});

describe('stageToQueueStatus', () => {
  it('mappe les stages serveur vers le dock', () => {
    expect(stageToQueueStatus('downloading')).toBe('download');
    expect(stageToQueueStatus('cropping')).toBe('crop');
  });
});
