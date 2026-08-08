import { ClipContainer } from './container';
import { getJobQueue, JobQueue } from './queue/JobQueue';
import { optionsResponse } from './http/cors';
import { jsonResponse } from './http/responses';
import { deleteExpiredClips, deleteOrphanClips } from './db/clips';
import { handleLogout, handleMe, handleRequestOtp, handleVerifyOtp } from './routes/auth';
import { handleClipDownload, handleDeleteClip } from './routes/clips';
import {
  handleInternalPurgeOrphans,
  handleInternalResetQueue,
  handleInternalSeedReview,
  handleInternalStage,
  handleInternalStopContainers,
} from './routes/internal';
import { handleCreateJob, handleDeleteJob, handleGetJob } from './routes/jobs';
import { handleMeClips, handleMeJobs, handleRegisterPush } from './routes/me';
import {
  handleMeDeviceUnlink,
  handleMeDevices,
  handlePairingClaim,
  handlePairingStart,
  handlePairingStatus,
  handlePairingUnlink,
} from './routes/pairing';
import {
  handleExtensionApi,
  handleExtensionZip,
  EXTENSION_API_PATH,
  EXTENSION_ZIP_PATH,
} from './routes/extension-release';
import { handleInstall, INSTALL_PATH } from './routes/install';
import { handleAdminRoutes } from './routes/admin';
import { handleDashboard, handleDashboardSpa } from './routes/dashboard';
import { requireContainerSecret, type Env } from './types';

/** Durable Object class exports required by wrangler bindings. */
export { ClipContainer, JobQueue };

const CRON_PURGE = '0 * * * *';
const CRON_PUMP = '*/5 * * * *';

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function pathParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const handler: ExportedHandler<Env> = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return optionsResponse(request, env);
    }

    const url = new URL(request.url);
    const rawPathname = url.pathname;
    const pathname = normalizePathname(rawPathname);

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
        return await handleMeDeviceUnlink(request, env, pathParam(deviceUnlink[1]!));
      }

      if (request.method === 'POST' && pathname === '/api/jobs') {
        return await handleCreateJob(request, env);
      }

      const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
      if (request.method === 'GET' && jobMatch) {
        return await handleGetJob(request, env, pathParam(jobMatch[1]!));
      }
      if (request.method === 'DELETE' && jobMatch) {
        return await handleDeleteJob(request, env, pathParam(jobMatch[1]!));
      }

      const stageMatch = pathname.match(/^\/api\/internal\/jobs\/([^/]+)$/);
      if (request.method === 'PATCH' && stageMatch) {
        // ctx available for waitUntil if internal handlers schedule notify work.
        return await handleInternalStage(request, env, pathParam(stageMatch[1]!), ctx);
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

      if (request.method === 'POST' && pathname === '/api/internal/seed-review') {
        return await handleInternalSeedReview(request, env);
      }

      const adminRes = await handleAdminRoutes(request, env, pathname);
      if (adminRes) return adminRes;

      // Signed query (exp+sig) or Bearer owner — not under /api.
      const clipMatch = pathname.match(/^\/clips\/([^/]+)$/);
      if ((request.method === 'GET' || request.method === 'HEAD') && clipMatch) {
        return await handleClipDownload(request, env, pathParam(clipMatch[1]!));
      }

      const deleteMatch = pathname.match(/^\/api\/clips\/([^/]+)$/);
      if (request.method === 'DELETE' && deleteMatch) {
        return await handleDeleteClip(request, env, pathParam(deleteMatch[1]!));
      }

      if (request.method === 'GET' && (pathname === '/' || pathname === '/health')) {
        return jsonResponse(request, env, { ok: true, service: 'clippy', app: true });
      }

      if (request.method === 'GET' && pathname === INSTALL_PATH) {
        return handleInstall(request);
      }
      // Dashboard: use raw path so `/dashboard/` is not redirected in a loop.
      if (
        (request.method === 'GET' || request.method === 'HEAD') &&
        rawPathname === '/dashboard'
      ) {
        return handleDashboard(request);
      }
      if (
        (request.method === 'GET' || request.method === 'HEAD') &&
        rawPathname.startsWith('/dashboard/')
      ) {
        const dashboardSpa = await handleDashboardSpa(request, env, rawPathname);
        if (dashboardSpa) return dashboardSpa;
      }
      if (request.method === 'GET' && pathname === EXTENSION_API_PATH) {
        return handleExtensionApi(request, env);
      }
      if (request.method === 'GET' && pathname === EXTENSION_ZIP_PATH) {
        return await handleExtensionZip(request, env);
      }

      return jsonResponse(request, env, { ok: false, error: 'not_found' }, 404);
    } catch (error) {
      console.error('worker error', error);
      return jsonResponse(request, env, { ok: false, error: 'internal_error' }, 500);
    }
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const cron = controller.cron;
    const runPurge = cron === CRON_PURGE || cron === undefined;
    const runPump = cron === CRON_PUMP || cron === CRON_PURGE || cron === undefined;

    if (runPurge) {
      try {
        await deleteExpiredClips(env);
      } catch (error) {
        console.error('scheduled deleteExpiredClips failed', error);
      }
      try {
        await deleteOrphanClips(env);
      } catch (error) {
        console.error('scheduled deleteOrphanClips failed', error);
      }
    }

    if (runPump) {
      try {
        requireContainerSecret(env);
        // JobQueue.pump() reaps stale jobs and stops idle slots atomically in the DO.
        await getJobQueue(env).pump();
      } catch (error) {
        console.error('scheduled queue pump failed', error);
      }
    }
  },
};

export default handler;
