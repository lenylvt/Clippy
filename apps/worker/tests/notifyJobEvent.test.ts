import { describe, expect, it } from 'vitest';
import { cleanYoutubeTitle } from '@clippy/shared/title';
import { shouldPushNotify } from '../src/notify/jobEvent';

function buildNotifyCopy(event: 'started' | 'done', videoTitle: string) {
  const name = cleanYoutubeTitle(videoTitle);
  if (event === 'started') return { title: 'Clip démarré', body: name };
  return { title: 'Clip prêt', body: name };
}

describe('notifyJobEvent start + done only', () => {
  it('n’envoie que start et fini', () => {
    expect(shouldPushNotify('started')).toBe(true);
    expect(shouldPushNotify('done')).toBe(true);
    expect(shouldPushNotify('progress')).toBe(false);
    expect(shouldPushNotify('error')).toBe(false);
  });

  it('envoie une notif distincte par job', () => {
    const a = buildNotifyCopy('done', 'Video A');
    const b = buildNotifyCopy('done', 'Video B');
    expect(a.title).toBe('Clip prêt');
    expect(b.title).toBe('Clip prêt');
    expect(a.body).not.toBe(b.body);
  });

  it('titre start / fini corrects', () => {
    expect(buildNotifyCopy('started', 'Ma vidéo').title).toBe('Clip démarré');
    expect(buildNotifyCopy('done', 'Ma vidéo').title).toBe('Clip prêt');
  });
});
