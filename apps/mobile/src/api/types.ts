export type { Clip, Job, JobStatus } from '@clippy/shared/types';
export type { JobStage } from '@clippy/shared/stages';
export { JOB_STAGES, labelForStage, stageToQueueStatus, queueBarWidth } from '@clippy/shared/stages';

import type { JobStage } from '@clippy/shared/stages';

export type AuthUser = {
  id: string;
  email: string;
};

export type PairedDevice = {
  id: string;
  label: string;
  pairedAt: number | null;
};

export type Ok<T extends Record<string, unknown> = Record<string, never>> = { ok: true } & T;

export type ApiErrorKind = 'network' | 'http' | 'api' | 'timeout' | 'parse' | 'aborted';

export type ApiErrorCode =
  | 'unauthorized'
  | 'otp_expired'
  | 'otp_locked'
  | 'otp_invalid'
  | 'invalid_email'
  | 'invalid_otp'
  | 'invalid_otp_format'
  | 'missing_token'
  | 'not_found'
  | 'network_error'
  | 'timeout'
  | 'invalid_json'
  | 'http_error'
  | 'missing_api_url'
  | 'invalid_path'
  | 'invalid_body'
  | (string & {});

export type ApiEnvelope = {
  ok?: boolean;
  error?: string;
};

/** Pass-through helper keeping JobStage in the type surface. */
export function asJobStage(stage: string): JobStage | string {
  return stage;
}
