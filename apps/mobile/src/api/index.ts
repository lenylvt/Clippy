export { API_URL, api, ApiError, isApiError, setOnUnauthorized } from './client';
export type { ApiOptions, ApiQuery, HttpMethod } from './client';

export {
  fetchMe,
  logout,
  requestOtp,
  verifyOtp,
} from './auth';
export type { AuthUser } from './auth';

export { deleteClip, fetchMyClips, getClip } from './clips';
export type { FetchClipsOpts } from './clips';

export { deleteJob, fetchMyJobs, pollMyJobs } from './jobs';
export type { FetchJobsOpts, PollMyJobsOpts } from './jobs';

export {
  claimPairing,
  fetchMyDevices,
  normalizeClaimCode,
  unlinkDevice,
} from './pairing';

export {
  registerPushToken,
  resolvePushPlatform,
  unregisterPushToken,
} from './push';
export type { PushPlatform, RegisterPushOpts } from './push';

export type {
  ApiEnvelope,
  ApiErrorCode,
  ApiErrorKind,
  Clip,
  Job,
  JobStage,
  JobStatus,
  Ok,
  PairedDevice,
} from './types';
export { JOB_STAGES, asJobStage, labelForStage, queueBarWidth, stageToQueueStatus } from './types';

