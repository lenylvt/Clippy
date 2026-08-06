import { describe, expect, it } from 'vitest';
import { labelForStage, stageToQueueStatus } from '@clippy/shared/stages';

describe('jobs stage mapping', () => {
  it('mappe les stages serveur vers la queue UI', () => {
    expect(stageToQueueStatus('queued')).toBe('queued');
    expect(stageToQueueStatus('preparing')).toBe('preparing');
    expect(stageToQueueStatus('downloading')).toBe('download');
    expect(stageToQueueStatus('cropping')).toBe('crop');
    expect(stageToQueueStatus('uploading')).toBe('upload');
    expect(stageToQueueStatus('done')).toBe('done');
    expect(stageToQueueStatus('error')).toBe('error');
  });

  it('affiche un statut clair sans pourcentage', () => {
    expect(labelForStage('downloading', 0.55)).toBe('Téléchargement…');
    expect(labelForStage('preparing')).toBe('Préparation…');
  });
});
