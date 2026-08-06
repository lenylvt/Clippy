import { cleanYoutubeTitle } from '@clippy/shared/title';
import type { Env, JobRow } from '../types';
import { listPushTokens } from '../db/push';

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  interruptionLevel?: 'active' | 'passive' | 'timeSensitive';
  _contentAvailable?: boolean;
  priority?: 'default' | 'normal' | 'high';
};

async function sendExpoPush(messages: ExpoMessage[]): Promise<void> {
  if (messages.length === 0) return;
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.error('expo push failed', res.status, await res.text().catch(() => ''));
    }
  } catch (error) {
    console.error('expo push error', error);
  }
}

/** Push events that actually notify the user. Progress / error stay silent. */
export function shouldPushNotify(event: string): boolean {
  return event === 'started' || event === 'done';
}

/**
 * One notification per job — only start + finished.
 * Progress and error events are ignored (UI still polls stages).
 */
export async function notifyJobEvent(
  env: Env,
  job: JobRow,
  event: 'started' | 'progress' | 'done' | 'error',
  opts?: { origin?: string },
): Promise<void> {
  if (!job.user_id) return;
  if (!shouldPushNotify(event)) return;

  const tokens = await listPushTokens(env, job.user_id);
  if (tokens.length === 0) return;

  const name = cleanYoutubeTitle(job.video_title);
  const origin = (opts?.origin || 'https://clippy.runtimelayer.workers.dev').replace(/\/+$/, '');
  const clipUrl = job.clip_id ? `${origin}/clips/${job.clip_id}` : undefined;

  const title = event === 'started' ? 'Clip démarré' : 'Clip prêt';

  await sendExpoPush(
    tokens.map((to) => ({
      to,
      title,
      body: name,
      sound: 'default',
      interruptionLevel: 'active',
      priority: event === 'done' ? 'high' : 'default',
      _contentAvailable: event === 'done',
      data: {
        type: `job_${event}`,
        jobId: job.id,
        stage: job.stage,
        status: job.status,
        progress: job.progress,
        clipId: job.clip_id,
        clipUrl,
      },
    })),
  );
}
