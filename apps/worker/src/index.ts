import { stopAllClipSlots } from './container';
import { getJobQueue, JobQueue } from './queue/JobQueue';
import { optionsResponse } from './http/cors';
import { jsonResponse } from './http/responses';
import { ClipContainer } from './container';
import { deleteExpiredClips, deleteOrphanClips } from './db/clips';
import { handleLogout, handleMe, handleRequestOtp, handleVerifyOtp } from './routes/auth';
import { handleClipDownload, handleDeleteClip } from './routes/clips';
import {
  handleInternalPurgeOrphans,
  handleInternalResetQueue,
  handleInternalStage,
  handleInternalStopContainers,
} from './routes/internal';
import { handleCreateJob, handleGetJob } from './routes/jobs';
import { handleMeClips, handleMeJobs, handleRegisterPush } from './routes/me';
import {
  handleMeDeviceUnlink,
  handleMeDevices,
  handlePairingClaim,
  handlePairingStart,
  handlePairingStatus,
  handlePairingUnlink,
} from './routes/pairing';
import type { Env } from './types';

export { ClipContainer, JobQueue };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return optionsResponse(request);
    }

    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (request.method === 'POST' && pathname === '/api/auth/request-otp') {
        return await handleRequestOtp(request, env);
      }
      if (request.method === 'POST' && pathname === '/api/auth/verify-otp') {
        return await handleVerifyOtp(request, env);
      }
      if (request.method === 'POST' && pathname === '/api/auth/logout') {
        return await handleLogout(request, env);
      }
      if (request.method === 'GET' && pathname === '/api/me') {
        return await handleMe(request, env);
      }
      if (request.method === 'GET' && pathname === '/api/me/clips') {
        return await handleMeClips(request, env);
      }
      if (request.method === 'GET' && pathname === '/api/me/jobs') {
        return await handleMeJobs(request, env);
      }
      if (request.method === 'POST' && pathname === '/api/me/push-token') {
        return await handleRegisterPush(request, env);
      }
      if (request.method === 'POST' && pathname === '/api/pairing/start') {
        return await handlePairingStart(request, env);
      }
      if (request.method === 'POST' && pathname === '/api/pairing/claim') {
        return await handlePairingClaim(request, env);
      }
      if (request.method === 'GET' && pathname === '/api/pairing/status') {
        return await handlePairingStatus(request, env);
      }
      if (request.method === 'POST' && pathname === '/api/pairing/unlink') {
        return await handlePairingUnlink(request, env);
      }
      if (request.method === 'GET' && pathname === '/api/me/devices') {
        return await handleMeDevices(request, env);
      }
      const deviceUnlink = pathname.match(/^\/api\/me\/devices\/([^/]+)$/);
      if (request.method === 'DELETE' && deviceUnlink) {
        return await handleMeDeviceUnlink(request, env, decodeURIComponent(deviceUnlink[1]!));
      }

      if (request.method === 'POST' && pathname === '/api/jobs') {
        return await handleCreateJob(request, env);
      }

      const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
      if (request.method === 'GET' && jobMatch) {
        return await handleGetJob(request, env, jobMatch[1]!);
      }

      const stageMatch = pathname.match(/^\/api\/internal\/jobs\/([^/]+)$/);
      if (request.method === 'PATCH' && stageMatch) {
        return await handleInternalStage(request, env, stageMatch[1]!);
      }

      if (request.method === 'POST' && pathname === '/api/internal/stop-containers') {
        return await handleInternalStopContainers(request, env);
      }

      if (request.method === 'POST' && pathname === '/api/internal/reset-queue') {
        return await handleInternalResetQueue(request, env);
      }

      if (request.method === 'POST' && pathname === '/api/internal/purge-orphans') {
        return await handleInternalPurgeOrphans(request, env);
      }

      const clipMatch = pathname.match(/^\/clips\/([^/]+)$/);
      if ((request.method === 'GET' || request.method === 'HEAD') && clipMatch) {
        return await handleClipDownload(request, env, clipMatch[1]!);
      }

      const deleteMatch = pathname.match(/^\/api\/clips\/([^/]+)$/);
      if (request.method === 'DELETE' && deleteMatch) {
        return await handleDeleteClip(request, env, deleteMatch[1]!);
      }

      if (request.method === 'GET' && pathname === '/') {
        return jsonResponse(request, { ok: true, service: 'clippy', app: true });
      }

      return jsonResponse(request, { ok: false, error: 'not_found' }, 404);
    } catch (error) {
      console.error('worker error', error);
      return jsonResponse(
        request,
        { ok: false, error: error instanceof Error ? error.message : 'internal_error' },
        500,
      );
    }
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await deleteExpiredClips(env);
    await deleteOrphanClips(env);
    // Reap stuck jobs / zombie containers via the queue DO.
    try {
      await getJobQueue(env).enqueue('__cron_pump__');
    } catch (error) {
      console.error('scheduled queue pump failed', error);
    }
    const runningSlots = await env.DB.prepare(
      `SELECT COUNT(*) as c FROM jobs WHERE status = 'running' AND expires_at > ?`,
    )
      .bind(Date.now())
      .first<{ c: number }>();
    const queued = await env.DB.prepare(
      `SELECT COUNT(*) as c FROM jobs WHERE status = 'queued' AND expires_at > ?`,
    )
      .bind(Date.now())
      .first<{ c: number }>();
    if ((runningSlots?.c ?? 0) === 0 && (queued?.c ?? 0) === 0) {
      await stopAllClipSlots(env);
    }
  },
};
