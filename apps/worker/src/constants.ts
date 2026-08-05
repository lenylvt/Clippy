export const MAX_CLIP_SECONDS = 300;
export const MIN_CLIP_SECONDS = 3;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_TITLE_LENGTH = 200;
export const DELETE_BATCH_SIZE = 20;
export const JOB_TTL_MS = 48 * 60 * 60 * 1000;
export const MAX_CONTAINER_SLOTS = 4;

export function clipSlotName(slot: number): string {
  return `slot-${slot}`;
}

export const JOB_STAGES = [
  'queued',
  'downloading',
  'cropping',
  'uploading',
  'done',
  'error',
] as const;

export type JobStage = (typeof JOB_STAGES)[number];
