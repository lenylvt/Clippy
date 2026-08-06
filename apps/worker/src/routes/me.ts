import { requireSessionUser } from '../auth/otp';
import { DEFAULT_CLIPS_PAGE_LIMIT } from '../constants';
import { listClipsForUser, listActiveJobsForUser, listJobsForUser } from '../db/userJobs';
import { rowToClip, rowToJob } from '../db/mappers';
import { upsertPushToken } from '../db/push';
import { asOptionalString, readJsonObject } from '../http/body';
import { workerOrigin } from '../http/cors';
import { corsJsonFromResponse, errorResponse, jsonResponse } from '../http/responses';
import { isExpoPushToken, isPushPlatform } from '../notify/jobEvent';
import type { Env } from '../types';

function parseLimit(raw: string | null, fallback: number): number {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.floor(n), 100));
}

export async function handleMeClips(request: Request, env: Env) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return corsJsonFromResponse(request, env, userOrRes);
  }
  const origin = workerOrigin(request);
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get('limit'), DEFAULT_CLIPS_PAGE_LIMIT);
  const offset = Math.max(0, Math.floor(Number(url.searchParams.get('offset') ?? 0) || 0));
  const rows = await listClipsForUser(env, userOrRes.id, { limit, offset });
  const clips = await Promise.all(rows.map((row) => rowToClip(row, origin, env)));
  return jsonResponse(request, env, {
    ok: true,
    clips,
  });
}

export async function handleMeJobs(request: Request, env: Env) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return corsJsonFromResponse(request, env, userOrRes);
  }
  const origin = workerOrigin(request);
  const url = new URL(request.url);
  const activeParam = url.searchParams.get('active');
  const activeOnly = activeParam === '1' || activeParam === 'true' || activeParam === 'yes';
  const jobs = activeOnly
    ? await listActiveJobsForUser(env, userOrRes.id)
    : await listJobsForUser(env, userOrRes.id);
  return jsonResponse(request, env, {
    ok: true,
    jobs: await Promise.all(jobs.map((j) => rowToJob(j, origin, env))),
  });
}

export async function handleRegisterPush(request: Request, env: Env) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return corsJsonFromResponse(request, env, userOrRes);
  }
  const parsed = await readJsonObject(request);
  if (!parsed.ok) {
    return errorResponse(request, env, parsed.error, 400);
  }
  const token = (asOptionalString(parsed.body.token) ?? '').trim();
  if (!token) {
    return errorResponse(request, env, 'missing_token', 400);
  }
  if (!isExpoPushToken(token)) {
    return errorResponse(request, env, 'invalid_token', 400);
  }
  const platformRaw = asOptionalString(parsed.body.platform);
  const platform = (platformRaw ?? 'ios').trim().toLowerCase();
  if (!isPushPlatform(platform)) {
    return errorResponse(request, env, 'invalid_platform', 400);
  }
  await upsertPushToken(env, userOrRes.id, token, platform);
  return jsonResponse(request, env, { ok: true });
}
