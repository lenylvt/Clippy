/** Calcule left/width (0–1) pour le segment rempli de la mini-timeline. */
export function clipTimelineLayout(start: number, end: number, spanEnd: number) {
  const s = Number.isFinite(start) && start > 0 ? start : 0;
  const e = Number.isFinite(end) && end > 0 ? end : 0;
  const spanRaw = Number.isFinite(spanEnd) && spanEnd > 0 ? spanEnd : 0;
  const span = Math.max(spanRaw, e, s, 1);
  const left = Math.min(1, Math.max(0, s / span));
  if (!(e > s)) {
    return { left, width: 0 };
  }
  const width = Math.min(1 - left, Math.max(0.02, (e - s) / span));
  return { left, width };
}

export function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}
