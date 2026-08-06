import { clamp } from './time';

/**
 * Pipeline stages on a job (`Job.stage`).
 * Distinct from dock UI statuses returned by {@link stageToQueueStatus}.
 */
export const JOB_STAGES = [
  'queued',
  'preparing',
  'downloading',
  'cropping',
  'uploading',
  'done',
  'error',
] as const;

export type JobStage = (typeof JOB_STAGES)[number];

/** Dock / progress-bar statuses (extension queue + mobile bar). */
export const QUEUE_STATUSES = [
  'queued',
  'preparing',
  'download',
  'crop',
  'upload',
  'done',
  'error',
  'unknown',
] as const;

export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export function isJobStage(value: string): value is JobStage {
  return (JOB_STAGES as readonly string[]).includes(value);
}

/** Libellés FR courts, lisibles dans la file d’attente. */
export const STAGE_LABELS: Record<JobStage, string> = {
  queued: 'En attente',
  preparing: 'Préparation…',
  downloading: 'Téléchargement…',
  cropping: 'Découpe…',
  uploading: 'Envoi…',
  done: 'Terminé',
  error: 'Échec',
};

/**
 * Human label for a server stage.
 * `progress` is accepted for call-site compatibility but unused (labels are stage-only).
 */
export function labelForStage(stage: string, _progress?: number): string {
  if (isJobStage(stage)) return STAGE_LABELS[stage];
  return 'En cours…';
}

/** Map server job stage → extension queue / dock UI status (idempotent on dock statuses). */
export function stageToQueueStatus(stage: string): QueueStatus {
  switch (stage) {
    case 'queued':
      return 'queued';
    case 'preparing':
      return 'preparing';
    case 'download':
    case 'downloading':
      return 'download';
    case 'crop':
    case 'cropping':
      return 'crop';
    case 'upload':
    case 'uploading':
      return 'upload';
    case 'done':
      return 'done';
    case 'error':
      return 'error';
    default:
      return 'unknown';
  }
}

/**
 * Progress bar width (%) — same rules as the Chrome queue dock.
 * Pass a **dock** {@link QueueStatus} (after {@link stageToQueueStatus}), not a raw server stage.
 * Keeps a tiny visible stub while queued/busy; full bar when done/error.
 */
export function queueBarWidth(status: QueueStatus, progress: number): number {
  const busy = status !== 'done' && status !== 'error';
  const pct = Math.round(clamp(progress, 0, 1) * 100);
  if (!busy) return 100;
  return Math.max(pct, status === 'queued' ? 4 : 8);
}
