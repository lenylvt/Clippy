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

export function labelForStage(stage: string, _progress?: number): string {
  return STAGE_LABELS[stage as JobStage] ?? stage;
}

/** Map server job stage → extension queue UI status. */
export function stageToQueueStatus(stage: string): string {
  switch (stage) {
    case 'queued':
      return 'queued';
    case 'preparing':
      return 'preparing';
    case 'downloading':
      return 'download';
    case 'cropping':
      return 'crop';
    case 'uploading':
      return 'upload';
    case 'done':
      return 'done';
    case 'error':
      return 'error';
    default:
      return 'queued';
  }
}

/**
 * Progress bar width (%) — same rules as the Chrome queue dock.
 * Keeps a tiny visible stub while queued/busy; full bar when done/error.
 */
export function queueBarWidth(status: string, progress: number): number {
  const busy = status !== 'done' && status !== 'error';
  const pct = Math.round(clamp01(progress) * 100);
  if (!busy) return 100;
  return Math.max(pct, status === 'queued' ? 4 : 8);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
