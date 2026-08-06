const STAGE_LABELS = {
  queued: 'En attente',
  preparing: 'Préparation…',
  downloading: 'Téléchargement…',
  cropping: 'Découpe…',
  uploading: 'Envoi…',
  done: 'Terminé',
  error: 'Échec',
};

/**
 * @param {string} stage
 * @param {number} [_progress]
 */
function labelForStage(stage, _progress) {
  return STAGE_LABELS[/** @type {keyof typeof STAGE_LABELS} */ (stage)] ?? stage;
}

/** @param {string} stage */
function stageToQueueStatus(stage) {
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

globalThis.STAGE_LABELS = STAGE_LABELS;
globalThis.labelForStage = labelForStage;
globalThis.stageToQueueStatus = stageToQueueStatus;
