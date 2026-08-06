/**
 * Keep in sync with @clippy/shared/stages.
 * IIFE — classic content scripts share one scope; avoid colliding with
 * content/queue/clip-queue.js `queueBarWidth`.
 */
(function () {
  const JOB_STAGES = [
    'queued',
    'preparing',
    'downloading',
    'cropping',
    'uploading',
    'done',
    'error',
  ];

  const STAGE_LABELS = {
    queued: 'En attente',
    preparing: 'Préparation…',
    downloading: 'Téléchargement…',
    cropping: 'Découpe…',
    uploading: 'Envoi…',
    done: 'Terminé',
    error: 'Échec',
  };

  /** @param {string} value */
  function isJobStage(value) {
    return JOB_STAGES.includes(value);
  }

  /**
   * @param {string} stage
   * @param {number} [_progress]
   */
  function labelForStage(stage, _progress) {
    if (isJobStage(stage)) return STAGE_LABELS[/** @type {keyof typeof STAGE_LABELS} */ (stage)];
    return 'En cours…';
  }

  /** @param {string} stage */
  function stageToQueueStatus(stage) {
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
   * @param {string} status dock status (after stageToQueueStatus)
   * @param {number} progress
   */
  function queueBarWidth(status, progress) {
    const busy = status !== 'done' && status !== 'error';
    const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
    const pct = Math.round(p * 100);
    if (!busy) return 100;
    return Math.max(pct, status === 'queued' ? 4 : 8);
  }

  globalThis.JOB_STAGES = JOB_STAGES;
  globalThis.STAGE_LABELS = STAGE_LABELS;
  globalThis.isJobStage = isJobStage;
  globalThis.labelForStage = labelForStage;
  globalThis.stageToQueueStatus = stageToQueueStatus;
  globalThis.queueBarWidth = queueBarWidth;
})();
