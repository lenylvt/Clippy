import { cleanYoutubeTitle } from '@clippy/shared/title';
import { extractYoutubeVideoId } from '@clippy/shared/youtube';
import { validateJobPayload } from '@clippy/shared/validateJob';
import { requireAdmin } from '../admin/requireAdmin';
import { collectCloudflareUsage } from '../admin/cfAnalytics';
import { estimateCosts } from '../admin/costEstimate';
import {
  adminCounts,
  deleteAllUserSessions,
  deleteClipAdmin,
  deleteSessionById,
  deleteTerminalJob,
  deleteUserCascade,
  deleteUserPushTokens,
  ensureAdminDeviceForUser,
  listAdminClips,
  listAdminDevices,
  listAdminJobs,
  listAdminUsers,
  listUserSessions,
  patchClipMeta,
  patchJobMeta,
  updateUserEmail,
} from '../admin/db';
import { createUser, getUserById } from '../db/users';
import { getJobById, insertJob, updateJobStage } from '../db/jobs';
import { unlinkDeviceByPrefix } from '../db/devices';
import { createPairingCode } from '../db/pairing';
import { stopAllClipSlots, stopClipSlot } from '../container';
import { deleteOrphanClips } from '../db/clips';
import { getJobQueue } from '../queue/JobQueue';
import { asOptionalNumber, asOptionalString, readJsonObject } from '../http/body';
import { workerOrigin } from '../http/cors';
import { createId, isUuid } from '../http/ids';
import { errorResponse, jsonResponse } from '../http/responses';
import type { Env } from '../types';
import type { PeriodKey } from '../admin/pricing';

function unauthorized(request: Request, env: Env) {
  return errorResponse(request, env, 'unauthorized', 401);
}

function periodFromUrl(url: URL): PeriodKey {
  const p = url.searchParams.get('period');
  if (p === 'billing' || p === 'today' || p === '7d' || p === '30d' || p === 'mtd') {
    return p;
  }
  return 'billing';
}

function cycleDay(env: Env): number {
  return Number(env.CF_BILLING_CYCLE_DAY ?? 1) || 1;
}

export async function handleAdminRoutes(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (!pathname.startsWith('/api/admin')) return null;
  if (!requireAdmin(request, env)) return unauthorized(request, env);

  const url = new URL(request.url);
  const method = request.method;

  if (method === 'GET' && pathname === '/api/admin/overview') {
    const counts = await adminCounts(env);
    const period = periodFromUrl(url);
    const { usage, missingSources } = await collectCloudflareUsage(env, period);
    const costs = estimateCosts(period, usage, missingSources, Date.now(), cycleDay(env));
    return jsonResponse(request, env, { ok: true, counts, costs });
  }

  if (method === 'GET' && pathname === '/api/admin/usage') {
    const period = periodFromUrl(url);
    const { usage, missingSources } = await collectCloudflareUsage(env, period);
    const costs = estimateCosts(period, usage, missingSources, Date.now(), cycleDay(env));
    return jsonResponse(request, env, { ok: true, costs });
  }

  // Users
  if (method === 'GET' && pathname === '/api/admin/users') {
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 200);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);
    const users = await listAdminUsers(env, limit, offset);
    return jsonResponse(request, env, { ok: true, users });
  }

  if (method === 'POST' && pathname === '/api/admin/users') {
    const parsed = await readJsonObject(request);
    if (!parsed.ok) return errorResponse(request, env, parsed.error, 400);
    const email = (asOptionalString(parsed.body.email) ?? '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return errorResponse(request, env, 'invalid_email', 400);
    }
    const user = await createUser(env, email);
    return jsonResponse(request, env, { ok: true, user });
  }

  const userMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userMatch) {
    const userId = userMatch[1]!;
    if (!isUuid(userId)) return errorResponse(request, env, 'not_found', 404);

    if (method === 'GET') {
      const user = await getUserById(env, userId);
      if (!user) return errorResponse(request, env, 'not_found', 404);
      const sessions = await listUserSessions(env, userId);
      return jsonResponse(request, env, { ok: true, user, sessions });
    }
    if (method === 'PATCH') {
      const parsed = await readJsonObject(request);
      if (!parsed.ok) return errorResponse(request, env, parsed.error, 400);
      const email = (asOptionalString(parsed.body.email) ?? '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        return errorResponse(request, env, 'invalid_email', 400);
      }
      const user = await updateUserEmail(env, userId, email);
      if (!user) return errorResponse(request, env, 'not_found', 404);
      return jsonResponse(request, env, { ok: true, user });
    }
    if (method === 'DELETE') {
      const ok = await deleteUserCascade(env, userId);
      if (!ok) return errorResponse(request, env, 'not_found', 404);
      return jsonResponse(request, env, { ok: true });
    }
  }

  const sessionsAll = pathname.match(/^\/api\/admin\/users\/([^/]+)\/sessions$/);
  if (method === 'DELETE' && sessionsAll) {
    const userId = sessionsAll[1]!;
    if (!isUuid(userId)) return errorResponse(request, env, 'not_found', 404);
    const deleted = await deleteAllUserSessions(env, userId);
    return jsonResponse(request, env, { ok: true, deleted });
  }

  const sessionOne = pathname.match(/^\/api\/admin\/users\/([^/]+)\/sessions\/([^/]+)$/);
  if (method === 'DELETE' && sessionOne) {
    const userId = sessionOne[1]!;
    const sid = sessionOne[2]!;
    if (!isUuid(userId)) return errorResponse(request, env, 'not_found', 404);
    const ok = await deleteSessionById(env, userId, sid);
    if (!ok) return errorResponse(request, env, 'not_found', 404);
    return jsonResponse(request, env, { ok: true });
  }

  const pushMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/push-tokens$/);
  if (method === 'DELETE' && pushMatch) {
    const userId = pushMatch[1]!;
    if (!isUuid(userId)) return errorResponse(request, env, 'not_found', 404);
    const deleted = await deleteUserPushTokens(env, userId);
    return jsonResponse(request, env, { ok: true, deleted });
  }

  // Jobs
  if (method === 'GET' && pathname === '/api/admin/jobs') {
    const status = url.searchParams.get('status') ?? undefined;
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);
    const jobs = await listAdminJobs(env, { status: status ?? undefined, limit, offset });
    return jsonResponse(request, env, { ok: true, jobs });
  }

  if (method === 'POST' && pathname === '/api/admin/jobs') {
    const parsed = await readJsonObject(request);
    if (!parsed.ok) return errorResponse(request, env, parsed.error, 400);
    const userId = (asOptionalString(parsed.body.userId) ?? '').trim();
    if (!isUuid(userId)) return errorResponse(request, env, 'invalid_user', 400);
    const user = await getUserById(env, userId);
    if (!user) return errorResponse(request, env, 'not_found', 404);

    const youtubeUrl = (asOptionalString(parsed.body.youtubeUrl) ?? '').trim();
    const clipStart = asOptionalNumber(parsed.body.clipStart);
    const clipEnd = asOptionalNumber(parsed.body.clipEnd);
    if (clipStart === undefined || clipEnd === undefined) {
      return errorResponse(request, env, 'invalid_clip_bounds', 400);
    }
    let videoId = (asOptionalString(parsed.body.videoId) ?? '').trim();
    if (!videoId) {
      videoId = extractYoutubeVideoId(youtubeUrl) ?? '';
    }
    const payload = {
      videoId,
      videoTitle: cleanYoutubeTitle(asOptionalString(parsed.body.videoTitle) ?? 'Sans titre'),
      youtubeUrl,
      clipStart,
      clipEnd,
    };
    const validationError = validateJobPayload(payload);
    if (validationError) return errorResponse(request, env, validationError, 400);

    const deviceToken = await ensureAdminDeviceForUser(env, userId);
    const id = createId();
    await insertJob(env, { id, ...payload, deviceToken, userId });
    try {
      await getJobQueue(env).enqueue(id, workerOrigin(request));
    } catch (error) {
      console.error('admin enqueue failed', id, error);
    }
    return jsonResponse(request, env, { ok: true, jobId: id, status: 'queued' });
  }

  const jobCancel = pathname.match(/^\/api\/admin\/jobs\/([^/]+)\/cancel$/);
  if (method === 'POST' && jobCancel) {
    const jobId = jobCancel[1]!;
    if (!isUuid(jobId)) return errorResponse(request, env, 'not_found', 404);
    const job = await getJobById(env, jobId);
    if (!job) return errorResponse(request, env, 'not_found', 404);
    if (job.status !== 'queued' && job.status !== 'running') {
      return errorResponse(request, env, 'not_cancellable', 409);
    }
    const slot = job.slot;
    const updated = await updateJobStage(env, jobId, {
      status: 'error',
      stage: 'error',
      progress: job.progress,
      error: 'cancelled_by_admin',
      slot: null,
    });
    if (!updated) return errorResponse(request, env, 'not_found', 404);
    if (slot != null) {
      try {
        await stopClipSlot(env, slot);
      } catch (error) {
        console.error('stopClipSlot after cancel', jobId, error);
      }
    }
    return jsonResponse(request, env, { ok: true });
  }

  const jobMatch = pathname.match(/^\/api\/admin\/jobs\/([^/]+)$/);
  if (jobMatch) {
    const jobId = jobMatch[1]!;
    if (!isUuid(jobId)) return errorResponse(request, env, 'not_found', 404);
    if (method === 'GET') {
      const job = await getJobById(env, jobId);
      if (!job) return errorResponse(request, env, 'not_found', 404);
      return jsonResponse(request, env, { ok: true, job });
    }
    if (method === 'PATCH') {
      const parsed = await readJsonObject(request);
      if (!parsed.ok) return errorResponse(request, env, parsed.error, 400);
      const videoTitle = asOptionalString(parsed.body.videoTitle);
      const expiresAt = asOptionalNumber(parsed.body.expiresAt);
      const job = await patchJobMeta(env, jobId, {
        videoTitle: videoTitle ?? undefined,
        expiresAt: expiresAt ?? undefined,
      });
      if (!job) return errorResponse(request, env, 'not_found', 404);
      return jsonResponse(request, env, { ok: true, job });
    }
    if (method === 'DELETE') {
      const ok = await deleteTerminalJob(env, jobId);
      if (!ok) return errorResponse(request, env, 'not_found', 404);
      return jsonResponse(request, env, { ok: true });
    }
  }

  // Clips
  if (method === 'GET' && pathname === '/api/admin/clips') {
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);
    const clips = await listAdminClips(env, limit, offset);
    return jsonResponse(request, env, { ok: true, clips });
  }

  const clipMatch = pathname.match(/^\/api\/admin\/clips\/([^/]+)$/);
  if (clipMatch) {
    const clipId = clipMatch[1]!;
    if (!isUuid(clipId)) return errorResponse(request, env, 'not_found', 404);
    if (method === 'PATCH') {
      const parsed = await readJsonObject(request);
      if (!parsed.ok) return errorResponse(request, env, parsed.error, 400);
      const clip = await patchClipMeta(env, clipId, {
        videoTitle: asOptionalString(parsed.body.videoTitle) ?? undefined,
        expiresAt: asOptionalNumber(parsed.body.expiresAt) ?? undefined,
      });
      if (!clip) return errorResponse(request, env, 'not_found', 404);
      return jsonResponse(request, env, { ok: true, clip });
    }
    if (method === 'DELETE') {
      const ok = await deleteClipAdmin(env, clipId);
      if (!ok) return errorResponse(request, env, 'not_found', 404);
      return jsonResponse(request, env, { ok: true });
    }
  }

  // Devices
  if (method === 'GET' && pathname === '/api/admin/devices') {
    const devices = await listAdminDevices(env);
    return jsonResponse(request, env, { ok: true, devices });
  }

  const deviceMatch = pathname.match(/^\/api\/admin\/devices\/([^/]+)$/);
  if (method === 'DELETE' && deviceMatch) {
    const id = decodeURIComponent(deviceMatch[1]!);
    // Prefer user_id from query for scoped unlink
    const userId = url.searchParams.get('userId');
    if (userId && isUuid(userId)) {
      const ok = await unlinkDeviceByPrefix(env, userId, id);
      if (!ok) return errorResponse(request, env, 'not_found', 404);
      return jsonResponse(request, env, { ok: true });
    }
    const result = await env.DB.prepare(
      `UPDATE devices SET user_id = NULL, paired_at = NULL, label = NULL
       WHERE device_id = ? OR device_token = ?`,
    )
      .bind(id, id)
      .run();
    if ((result.meta?.changes ?? 0) === 0) {
      return errorResponse(request, env, 'not_found', 404);
    }
    return jsonResponse(request, env, { ok: true });
  }

  // Pairing
  if (method === 'POST' && pathname === '/api/admin/pairing/start') {
    const parsed = await readJsonObject(request);
    if (!parsed.ok) return errorResponse(request, env, parsed.error, 400);
    const userId = (asOptionalString(parsed.body.userId) ?? '').trim();
    if (!isUuid(userId)) return errorResponse(request, env, 'invalid_user', 400);
    const user = await getUserById(env, userId);
    if (!user) return errorResponse(request, env, 'not_found', 404);
    const deviceToken = await ensureAdminDeviceForUser(env, userId);
    // Pairing codes are for unclaimed devices; for admin we create a fresh unpaired device
    const { randomToken } = await import('../auth/crypto');
    const { ensureDevice } = await import('../db/devices');
    const fresh = randomToken(32);
    await ensureDevice(env, fresh);
    const { code, expiresAt } = await createPairingCode(env, fresh);
    return jsonResponse(request, env, {
      ok: true,
      code,
      expiresAt,
      deviceToken: fresh,
      note: 'User claims via app; admin device remains separate',
      adminDeviceToken: deviceToken,
    });
  }

  const pairingDel = pathname.match(/^\/api\/admin\/pairing\/([^/]+)$/);
  if (method === 'DELETE' && pairingDel) {
    const code = pairingDel[1]!;
    await env.DB.prepare(`DELETE FROM pairing_codes WHERE code = ?`).bind(code).run();
    return jsonResponse(request, env, { ok: true });
  }

  // Ops
  if (method === 'POST' && pathname === '/api/admin/ops/stop-containers') {
    const stopped = await stopAllClipSlots(env);
    return jsonResponse(request, env, { ok: true, stopped });
  }
  if (method === 'POST' && pathname === '/api/admin/ops/reset-queue') {
    const result = await getJobQueue(env).resetQueue();
    return jsonResponse(request, env, {
      ok: true,
      stopped: result.stopped,
      failedRunning: result.failedRunning,
    });
  }
  if (method === 'POST' && pathname === '/api/admin/ops/purge-orphans') {
    const deleted = await deleteOrphanClips(env);
    return jsonResponse(request, env, { ok: true, deleted });
  }

  return errorResponse(request, env, 'not_found', 404);
}
