import { createUser, getUserByEmail } from '../db/users';
import type { Env, UserRow } from '../types';
import {
  REVIEW_ARTIFACT_TTL_MS,
  REVIEW_CLIP_ID,
  REVIEW_CLIP_R2_KEY,
  REVIEW_DEVICE_TOKEN,
  REVIEW_JOB_IDS,
  REVIEW_ORIGIN,
} from './constants';
import { reviewDemoMp4Bytes } from './demoMp4';
import { reviewEmail } from './auth';

const DEMO_VIDEO_ID = 'dQw4w9WgXcQ';
const DEMO_YOUTUBE = `https://www.youtube.com/watch?v=${DEMO_VIDEO_ID}`;

async function ensureReviewUser(env: Env, email: string): Promise<UserRow> {
  const existing = await getUserByEmail(env, email);
  if (existing) return existing;
  try {
    return await createUser(env, email);
  } catch (error) {
    const again = await getUserByEmail(env, email);
    if (again) return again;
    throw error;
  }
}

async function clearReviewArtifacts(env: Env, userId: string): Promise<void> {
  const jobIds = Object.values(REVIEW_JOB_IDS);
  for (const id of jobIds) {
    await env.DB.prepare(`DELETE FROM jobs WHERE id = ?`).bind(id).run();
  }
  await env.DB.prepare(
    `DELETE FROM jobs WHERE user_id = ? AND device_token = ?`,
  )
    .bind(userId, REVIEW_DEVICE_TOKEN)
    .run();

  const clip = await env.DB.prepare(`SELECT r2_key FROM clips WHERE id = ?`)
    .bind(REVIEW_CLIP_ID)
    .first<{ r2_key: string }>();
  if (clip?.r2_key) {
    await env.CLIPS.delete(clip.r2_key).catch(() => undefined);
  }
  await env.DB.prepare(`DELETE FROM clips WHERE id = ?`).bind(REVIEW_CLIP_ID).run();
  await env.DB.prepare(
    `DELETE FROM clips WHERE user_id = ? AND r2_key = ?`,
  )
    .bind(userId, REVIEW_CLIP_R2_KEY)
    .run();
}

async function putDemoMp4(env: Env): Promise<void> {
  const bytes = reviewDemoMp4Bytes();
  await env.CLIPS.put(REVIEW_CLIP_R2_KEY, bytes, {
    httpMetadata: { contentType: 'video/mp4' },
  });
}

async function insertReviewClip(env: Env, userId: string, now: number): Promise<void> {
  const expiresAt = now + REVIEW_ARTIFACT_TTL_MS;
  await env.DB.prepare(
    `INSERT INTO clips (
      id, video_id, video_title, youtube_url, r2_key,
      clip_start, clip_end, created_at, expires_at, user_id, video_duration
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      REVIEW_CLIP_ID,
      DEMO_VIDEO_ID,
      'Demo — clip réussi (review)',
      DEMO_YOUTUBE,
      REVIEW_CLIP_R2_KEY,
      10,
      25,
      now,
      expiresAt,
      userId,
      212,
    )
    .run();
}

async function insertReviewJob(
  env: Env,
  input: {
    id: string;
    userId: string;
    status: string;
    stage: string;
    progress: number;
    title: string;
    error: string | null;
    clipStart: number;
    clipEnd: number;
    now: number;
  },
): Promise<void> {
  const expiresAt = input.now + REVIEW_ARTIFACT_TTL_MS;
  await env.DB.prepare(
    `INSERT INTO jobs (
      id, status, stage, progress, video_id, video_title, youtube_url,
      clip_start, clip_end, clip_id, error, device_token, slot,
      created_at, updated_at, expires_at, user_id, r2_key, attempts, origin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, NULL, 0, ?)`,
  )
    .bind(
      input.id,
      input.status,
      input.stage,
      input.progress,
      DEMO_VIDEO_ID,
      input.title,
      DEMO_YOUTUBE,
      input.clipStart,
      input.clipEnd,
      input.error,
      REVIEW_DEVICE_TOKEN,
      input.now,
      input.now,
      expiresAt,
      input.userId,
      REVIEW_ORIGIN,
    )
    .run();
}

export type SeedReviewResult =
  | { ok: true; email: string; userId: string; clipId: string; jobIds: string[] }
  | { ok: false; error: string };

/**
 * Idempotent App Store review fixtures: one playable clip + frozen job states.
 * Requires `REVIEW_EMAIL` (and typically `REVIEW_OTP`) on the Worker env.
 */
export async function seedAppStoreReview(env: Env): Promise<SeedReviewResult> {
  const email = reviewEmail(env);
  if (!email) {
    return { ok: false, error: 'review_email_not_configured' };
  }

  const user = await ensureReviewUser(env, email);
  await clearReviewArtifacts(env, user.id);
  await putDemoMp4(env);

  const now = Date.now();
  await insertReviewClip(env, user.id, now);

  await insertReviewJob(env, {
    id: REVIEW_JOB_IDS.queued,
    userId: user.id,
    status: 'queued',
    stage: 'queued',
    progress: 0,
    title: 'Demo — en attente',
    error: null,
    clipStart: 0,
    clipEnd: 15,
    now,
  });
  await insertReviewJob(env, {
    id: REVIEW_JOB_IDS.downloading,
    userId: user.id,
    status: 'running',
    stage: 'downloading',
    progress: 0.35,
    title: 'Demo — téléchargement',
    error: null,
    clipStart: 30,
    clipEnd: 45,
    now,
  });
  await insertReviewJob(env, {
    id: REVIEW_JOB_IDS.cropping,
    userId: user.id,
    status: 'running',
    stage: 'cropping',
    progress: 0.62,
    title: 'Demo — découpe (étape figée)',
    error: null,
    clipStart: 60,
    clipEnd: 75,
    now,
  });
  await insertReviewJob(env, {
    id: REVIEW_JOB_IDS.error,
    userId: user.id,
    status: 'error',
    stage: 'error',
    progress: 1,
    title: 'Demo — échec',
    error: 'demo_failed',
    clipStart: 90,
    clipEnd: 105,
    now,
  });

  return {
    ok: true,
    email,
    userId: user.id,
    clipId: REVIEW_CLIP_ID,
    jobIds: Object.values(REVIEW_JOB_IDS),
  };
}
