import { describe, expect, it } from 'vitest';
import { cleanYoutubeTitle } from '@clippy/shared/title';
import { labelForStage } from '@clippy/shared/stages';

describe('cleanYoutubeTitle', () => {
  it('retire (1) et suffixe YouTube', () => {
    expect(cleanYoutubeTitle('(1) Me at the zoo - YouTube')).toBe('Me at the zoo');
    expect(cleanYoutubeTitle('Clip (2) - YouTube')).toBe('Clip');
  });
});

describe('labelForStage', () => {
  it('retourne le libellé FR', () => {
    expect(labelForStage('queued')).toBe('En attente');
    expect(labelForStage('preparing')).toBe('Préparation…');
    expect(labelForStage('downloading')).toBe('Téléchargement…');
    expect(labelForStage('cropping')).toBe('Découpe…');
    expect(labelForStage('uploading')).toBe('Envoi…');
    expect(labelForStage('done')).toBe('Terminé');
  });
});
