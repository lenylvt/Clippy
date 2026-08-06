/**
 * Parse a single `Range: bytes=…` request.
 *
 * Supported forms:
 * - `bytes=0-499` — closed interval
 * - `bytes=500-` — open end (through last byte)
 * - `bytes=-500` — suffix (last N bytes)
 *
 * Returns:
 * - `{ ok: true, … }` when the range is satisfiable
 * - `{ ok: false, reason: 'unsatisfiable' }` when syntactically valid but outside the resource (RFC 7233 → 416)
 * - `null` when absent, malformed, multi-range, empty `bytes=-`, or `size <= 0`
 */
export type SatisfiableBytesRange = {
  ok: true;
  offset: number;
  length: number;
  start: number;
  end: number;
};

export type UnsatisfiableBytesRange = {
  ok: false;
  reason: 'unsatisfiable';
};

export type BytesRangeResult = SatisfiableBytesRange | UnsatisfiableBytesRange;

export function parseBytesRange(
  header: string | null,
  size: number,
): BytesRangeResult | null {
  if (!header || size <= 0) return null;

  const trimmed = header.trim();
  // Multi-range and non-bytes units are unsupported — treat as malformed.
  if (/^bytes\s*=\s*.*,/i.test(trimmed)) return null;

  const m = /^bytes\s*=\s*(\d*)\s*-\s*(\d*)$/i.exec(trimmed);
  if (!m) return null;

  const startRaw = m[1]!;
  const endRaw = m[2]!;

  // `bytes=-` (both empty) is invalid — not a full-file open range.
  if (startRaw === '' && endRaw === '') return null;

  if (startRaw === '' && endRaw !== '') {
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    if (size === 0) return { ok: false, reason: 'unsatisfiable' };
    const start = Math.max(0, size - suffix);
    const end = size - 1;
    return {
      ok: true,
      offset: start,
      length: end - start + 1,
      start,
      end,
    };
  }

  const start = Number(startRaw);
  if (!Number.isFinite(start) || start < 0) return null;

  if (start >= size) {
    return { ok: false, reason: 'unsatisfiable' };
  }

  const end = endRaw === '' ? size - 1 : Number(endRaw);
  if (!Number.isFinite(end)) return null;
  if (endRaw !== '' && end < start) return null;

  const clampedEnd = Math.min(end, size - 1);
  return {
    ok: true,
    offset: start,
    length: clampedEnd - start + 1,
    start,
    end: clampedEnd,
  };
}
