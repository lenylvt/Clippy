/**
 * Tooltip helpers for timeline clip hover.
 * @typedef {{ id: string; start: number; end: number; status?: string }} TimelineClipMark
 */

/**
 * @param {HTMLElement | null | { hidden?: boolean; style?: Record<string, string>; offsetWidth?: number; offsetHeight?: number; querySelector?: Function }} tooltip
 * @param {TimelineClipMark | null} clip
 * @param {{ x: number; y: number; timeline: DOMRect }} [pos]
 */
function updateClipTooltip(tooltip, clip, pos) {
  if (!tooltip || typeof tooltip !== 'object') return;
  if (!clip || !pos) {
    tooltip.hidden = true;
    return;
  }

  const startEl = typeof tooltip.querySelector === 'function' ? tooltip.querySelector('[data-tip-start]') : null;
  const durEl = typeof tooltip.querySelector === 'function' ? tooltip.querySelector('[data-tip-duration]') : null;
  const endEl = typeof tooltip.querySelector === 'function' ? tooltip.querySelector('[data-tip-end]') : null;
  if (startEl) startEl.textContent = formatDuration(clip.start);
  if (durEl) durEl.textContent = formatDuration(clip.end - clip.start);
  if (endEl) endEl.textContent = formatDuration(clip.end);

  tooltip.hidden = false;

  const tw = tooltip.offsetWidth || 120;
  const th = tooltip.offsetHeight || 64;
  const pad = 8;
  let left = pos.x - pos.timeline.left - tw / 2;
  left = Math.max(pad, Math.min(left, pos.timeline.width - tw - pad));
  let top = pos.y - pos.timeline.top - th - 10;
  if (top < 4) top = pos.y - pos.timeline.top + 14;

  if (tooltip.style) {
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }
}

globalThis.updateClipTooltip = updateClipTooltip;
