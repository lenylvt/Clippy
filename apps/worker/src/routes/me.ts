import { requireSessionUser } from '../auth/otp';
import { listClipsForUser, listActiveJobsForUser, listJobsForUser } from '../db/userJobs';
import { rowToClip, rowToJob } from '../db/mappers';
import { upsertPushToken } from '../db/push';
import { getOrigin } from '../http/cors';
import { jsonResponse } from '../http/responses';
import type { Env } from '../types';

export async function handleMeClips(request: Request, env: Env) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return jsonResponse(request, await userOrRes.json(), userOrRes.status);
  }
  const origin = getOrigin(request);
  const rows = await listClipsForUser(env, userOrRes.id);
  return jsonResponse(request, {
    ok: true,
    clips: rows.map((row) => rowToClip(row, origin)),
  });
}

export async function handleMeJobs(request: Request, env: Env) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return jsonResponse(request, await userOrRes.json(), userOrRes.status);
  }
  const origin = getOrigin(request);
  const url = new URL(request.url);
  const activeOnly = url.searchParams.get('active') === '1';
  const jobs = activeOnly
    ? await listActiveJobsForUser(env, userOrRes.id)
    : await listJobsForUser(env, userOrRes.id);
  return jsonResponse(request, {
    ok: true,
    jobs: jobs.map((j) => rowToJob(j, origin)),
  });
}

export async function handleRegisterPush(request: Request, env: Env) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return jsonResponse(request, await userOrRes.json(), userOrRes.status);
  }
  let body: { token?: string; platform?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(request, { ok: false, error: 'invalid_json' }, 400);
  }
  const token = String(body.token ?? '').trim();
  if (!token) {
    return jsonResponse(request, { ok: false, error: 'missing_token' }, 400);
  }
  await upsertPushToken(env, userOrRes.id, token, String(body.platform ?? 'ios'));
  return jsonResponse(request, { ok: true });
}
