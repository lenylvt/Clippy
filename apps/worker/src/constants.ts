import {
  JOB_STAGES,
  type JobStage,
} from '@clippy/shared/stages';
import {
  MAX_CLIP_SECONDS,
  MAX_TITLE_LENGTH,
  MIN_CLIP_SECONDS,
} from '@clippy/shared/clipLimits';

export {
  JOB_STAGES,
  MAX_CLIP_SECONDS,
  MAX_TITLE_LENGTH,
  MIN_CLIP_SECONDS,
  type JobStage,
};

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const DELETE_BATCH_SIZE = 20;
export const JOB_TTL_MS = 48 * 60 * 60 * 1000;
export const MAX_CONTAINER_SLOTS = 4;

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PAIRING_TTL_MS = 2 * 60 * 1000;
export const OTP_FROM_EMAIL = 'clippy@lenylvt.cc';
export const OTP_FROM_NAME = 'Clippy';

export function clipSlotName(slot: number): string {
  return `slot-${slot}`;
}
