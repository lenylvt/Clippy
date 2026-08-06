/**
 * @typedef {{
 *   playhead: HTMLElement | null;
 *   videoFrame: HTMLElement | null;
 *   saveBtn: HTMLButtonElement | null;
 *   regionsHost: HTMLElement | null;
 *   clipTooltip: HTMLElement | null;
 *   panel: HTMLElement | null;
 *   timeline: HTMLElement | null;
 * }} EditorRenderRefs
 */

/**
 * @param {HTMLElement} root
 * @returns {EditorRenderRefs}
 */
function captureEditorRenderRefs(root) {
  const save = root.querySelector('[data-action="save"]');
  const regionsHost = root.querySelector('[data-regions]');
  const clipTooltip = root.querySelector('[data-clip-tooltip]');
  const timeline = root.querySelector('[data-timeline]');
  return {
    playhead: root.querySelector('[data-playhead]'),
    videoFrame: root.querySelector('[data-video-frame]'),
    saveBtn: save instanceof HTMLButtonElement ? save : null,
    regionsHost: regionsHost instanceof HTMLElement ? regionsHost : null,
    clipTooltip: clipTooltip instanceof HTMLElement ? clipTooltip : null,
    panel: root.querySelector('[data-panel]'),
    timeline: timeline instanceof HTMLElement ? timeline : null,
  };
}

/**
 * @param {HTMLElement} host
 * @param {{ id: string; start: number; end: number; colorIndex: number }[]} clips
 * @param {string | null} activeId
 * @param {number} duration
 */
function renderEditorRegions(host, clips, activeId, duration) {
  if (!(duration > 0)) {
    while (host.firstChild) host.removeChild(host.firstChild);
    return;
  }

  const existing = new Map(
    [...host.querySelectorAll('[data-clip-id]')].map((node) => [
      node.getAttribute('data-clip-id'),
      node,
    ]),
  );

  for (const clip of clips) {
    const len = clip.end - clip.start;
    if (!(len > 0)) continue;
    const color = editorClipColor(clip.colorIndex);
    const active = clip.id === activeId;
    let el = existing.get(clip.id);
    if (!(el instanceof HTMLElement)) {
      el = document.createElement('div');
      el.className = 'clippy-region';
      el.dataset.clipId = clip.id;
      el.setAttribute('role', 'group');

      const left = document.createElement('div');
      left.className = 'clippy-handle clippy-handle-left';
      left.dataset.handle = 'left';
      left.setAttribute('aria-label', 'Début du clip');

      const right = document.createElement('div');
      right.className = 'clippy-handle clippy-handle-right';
      right.dataset.handle = 'right';
      right.setAttribute('aria-label', 'Fin du clip');

      el.append(left, right);
      host.appendChild(el);
    } else {
      existing.delete(clip.id);
      host.appendChild(el);
    }

    el.dataset.region = '1';
    el.dataset.start = String(clip.start);
    el.dataset.end = String(clip.end);
    el.dataset.colorIndex = String(clip.colorIndex);
    el.classList.toggle('clippy-region--active', active);
    el.style.left = `${(clip.start / duration) * 100}%`;
    el.style.width = `${(len / duration) * 100}%`;
    el.style.setProperty('--clippy-clip-fill', color.fill);
    el.style.setProperty('--clippy-clip-border', color.border);
    el.style.setProperty('--clippy-clip-handle', color.handle);
    el.setAttribute(
      'aria-label',
      `${formatDuration(clip.start)} – ${formatDuration(clip.end)}${active ? ' (actif)' : ''}`,
    );
  }

  for (const stale of existing.values()) stale.remove();
}

/**
 * @param {{
 *   root: HTMLElement;
 *   refs?: EditorRenderRefs | null;
 *   video: HTMLVideoElement;
 *   duration: number;
 *   clips: { id: string; start: number; end: number; colorIndex: number }[];
 *   activeId: string | null;
 * }} state
 */
function renderEditorPanel(state) {
  const { root, video, duration, clips, activeId } = state;
  const refs = state.refs ?? captureEditorRenderRefs(root);
  if (!(duration > 0)) return;

  const pct = (t) => `${(t / duration) * 100}%`;
  const currentTime = video.currentTime;
  const active = clips.find((c) => c.id === activeId);
  const inClip = active
    ? isTimeInClip(currentTime, active.start, active.end)
    : clips.some((c) => isTimeInClip(currentTime, c.start, c.end));

  if (refs.regionsHost) {
    renderEditorRegions(refs.regionsHost, clips, activeId, duration);
  }

  if (refs.playhead instanceof HTMLElement) {
    refs.playhead.style.left = pct(currentTime);
    refs.playhead.setAttribute('aria-valuenow', String(Math.round(currentTime * 10) / 10));
    refs.playhead.setAttribute('aria-valuemin', '0');
    refs.playhead.setAttribute('aria-valuemax', String(duration));
  }

  if (refs.videoFrame instanceof HTMLElement) {
    refs.videoFrame.classList.toggle('clippy-video-frame--in-clip', inClip);
  }

  if (refs.saveBtn) {
    const n = clips.length;
    const label = n > 1 ? `Clipper ${n}` : 'Clipper';
    const kbd = refs.saveBtn.querySelector('kbd');
    if (kbd) {
      const text = `${label} `;
      const before = refs.saveBtn.childNodes[0];
      if (before?.nodeType === Node.TEXT_NODE) {
        if (before.textContent !== text) before.textContent = text;
      } else {
        refs.saveBtn.insertBefore(document.createTextNode(text), kbd);
      }
    } else if (refs.saveBtn.textContent !== label) {
      refs.saveBtn.textContent = label;
    }
    refs.saveBtn.setAttribute('aria-label', `${label} (Entrée)`);
  }
}

globalThis.captureEditorRenderRefs = captureEditorRenderRefs;
globalThis.renderEditorRegions = renderEditorRegions;
globalThis.renderEditorPanel = renderEditorPanel;
