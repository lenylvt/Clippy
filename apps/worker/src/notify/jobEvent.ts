import { cleanTitle } from '@clippy/shared/title';
import type { Env, JobRow } from '../types';
import { listPushTokens } from '../db/push';
import {
  buildSignedClipUrl,
  clipSigningSecret,
  defaultClipUrlExpiry,
} from '../http/clipUrl';
import { sendExpoPush, type ExpoMessage } from './expoPush';

export type JobPushEvent = 'started' | 'progress' | 'done' | 'error';

const EXPO_PUSH_TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;
export const MAX_EXPO_PUSH_TOKEN_LENGTH = 200;
export const PUSH_PLATFORMS = ['ios', 'android'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/** Expo push token format + length bound (registration + defense in depth). */
export function isExpoPushToken(token: string): boolean {
  return token.length > 0 && token.length <= MAX_EXPO_PUSH_TOKEN_LENGTH && EXPO_PUSH_TOKEN_RE.test(token);
}

export function isPushPlatform(value: string): value is PushPlatform {
  return (PUSH_PLATFORMS as readonly string[]).includes(value);
}

/** Push events that actually notify the user. Progress / error stay silent. */
export function shouldPushNotify(event: JobPushEvent): boolean {
  return event === 'started' || event === 'done';
}

function resolvePublicOrigin(env: Env, optsOrigin?: string): string {
  const raw = (optsOrigin || env.PUBLIC_ORIGIN || '').trim();
  return raw.replace(/\/+$/, '');
}

/**
 * Notify on job start + finished only (two pushes max per job).
 * Progress and error events are ignored (UI still polls stages).
 */
export async function notifyJobEvent(
  env: Env,
  job: JobRow,
  event: JobPushEvent,
  opts?: { origin?: string },
): Promise<void> {
  try {
    if (!job.user_id) return;
    if (!shouldPushNotify(event)) return;
    if (event === 'done' && !job.clip_id) {
      console.warn('notifyJobEvent skip done without clip_id', { jobId: job.id });
      return;
    }

    const tokens = await listPushTokens(env, job.user_id);
    if (tokens.length === 0) return;

    const name = cleanTitle(job.video_title);
    const origin = resolvePublicOrigin(env, opts?.origin);
    const clipUrl =
      job.clip_id && origin
        ? await buildSignedClipUrl(
            origin,
            job.clip_id,
            clipSigningSecret(env),
            Math.max(job.expires_at, defaultClipUrlExpiry()),
          )
        : undefined;

    const title = event === 'started' ? 'Clip démarré' : 'Clip prêt';
    const messages: ExpoMessage[] = tokens.map((to) => ({
      to,
      title,
      body: name,
      sound: 'default',
      channelId: 'clips',
      collapseId: job.id,
      ttl: event === 'started' ? 120 : undefined,
      interruptionLevel: event === 'started' ? 'passive' : 'active',
      priority: 'high',
      _contentAvailable: event === 'done',
      data: {
        type: `job_${event}`,
        jobId: job.id,
        clipId: job.clip_id,
        clipUrl,
      },
    }));

    console.log('notifyJobEvent send', {
      jobId: job.id,
      userId: job.user_id,
      event,
      tokenCount: tokens.length,
    });

    await sendExpoPush(env, messages);
  } catch (error) {
    console.error('notifyJobEvent failed', {
      jobId: job.id,
      userId: job.user_id,
      event,
      error,
    });
  }
}
