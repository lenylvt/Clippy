const DEFAULT_CLIP_DURATION = 90;

/** @returns {HTMLVideoElement | null} */
function getVideo() {
  return document.querySelector('video.html5-main-video') ?? document.querySelector('video');
}

/** @returns {Promise<HTMLVideoElement | null>} */
function waitForVideo() {
  const existing = getVideo();
  if (!existing) return Promise.resolve(null);

  if (Number.isFinite(existing.duration) && existing.duration > 0) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    const done = () => {
      existing.removeEventListener('loadedmetadata', done);
      existing.removeEventListener('durationchange', done);
      resolve(Number.isFinite(existing.duration) && existing.duration > 0 ? existing : null);
    };

    existing.addEventListener('loadedmetadata', done);
    existing.addEventListener('durationchange', done);
    window.setTimeout(done, 2500);
  });
}

/**
 * @param {{ start: number; end: number }} clip
 */
async function enqueueClipJob(clip) {
  const video = getVideo();
  const thumbUrl = captureVideoThumb(video);
  const job = clippyQueue.enqueue({
    start: clip.start,
    end: clip.end,
    thumbUrl,
  });

  clippyLog('content', 'queue:add', { id: job.id, start: clip.start, end: clip.end });

  try {
    clippyQueue.update(job.id, {
      status: 'queued',
      label: 'En file d’attente…',
      progress: 0.02,
    });

    const result = await startClipJob(clip, { jobId: job.id });

    clippyQueue.update(job.id, {
      status: 'done',
      label: 'Clip prêt',
      progress: 1,
      galleryUrl: result.galleryUrl,
    });
    clippyLog('content', 'queue:done', { id: job.id, galleryUrl: result.galleryUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    clippyLog('content', 'queue:fail', { id: job.id, error: message });
    clippyQueue.update(job.id, {
      status: 'error',
      label: 'Échec',
      error: message,
      progress: 1,
    });
  }
}

const editor = new ClipEditor({
  onSave(clip) {
    void enqueueClipJob(clip);
  },
});

async function openClipEditor(options = {}) {
  clippyLog('content', 'openClipEditor', options);
  const video = await waitForVideo();
  if (!video) {
    clippyLog('content', 'openClipEditor:no_video');
    return;
  }

  const { clipDuration = DEFAULT_CLIP_DURATION } = await chrome.storage.sync.get('clipDuration');
  editor.open(video, clipDuration);
}

/**
 * @param {{
 *   jobId?: string;
 *   stage?: string;
 *   label?: string;
 *   progress?: number;
 *   variant?: string;
 *   galleryUrl?: string;
 * }} message
 */
function handleJobProgress(message) {
  const { jobId, stage, label, progress, galleryUrl } = message;
  if (!jobId) {
    if (typeof label === 'string') {
      showStatusBadge(label, { variant: message.variant === 'error' ? 'error' : 'default' });
    }
    return;
  }

  /** @type {'queued' | 'download' | 'crop' | 'upload' | 'done' | 'error' | undefined} */
  let status;
  if (stage === 'download') status = 'download';
  else if (stage === 'crop') status = 'crop';
  else if (stage === 'upload') status = 'upload';
  else if (stage === 'done') status = 'done';
  else if (stage === 'error') status = 'error';
  else if (stage === 'queued') status = 'queued';

  clippyQueue.update(jobId, {
    status,
    label: typeof label === 'string' ? label : undefined,
    progress: typeof progress === 'number' ? progress : undefined,
    galleryUrl: typeof galleryUrl === 'string' ? galleryUrl : undefined,
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'OPEN_CLIP_EDITOR') {
    openClipEditor({ from: 'extension' });
    return;
  }

  if (message?.type === 'CLIPPY_JOB_PROGRESS') {
    handleJobProgress(message);
    return;
  }

  if (message?.type === 'CLIPPY_STATUS' && typeof message.label === 'string') {
    if (message.jobId) {
      handleJobProgress(message);
      return;
    }
    showStatusBadge(message.label, {
      variant: message.variant === 'error' ? 'error' : 'default',
    });
  }
});

injectPlayerButton(() => openClipEditor({ from: 'player_button' }));
