export function createId() {
  return crypto.randomUUID();
}

/** UUID (any RFC version) — path ids from `createId()` / migrations. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Sanitize a single path segment for R2 object keys (no empty / `.` / `..`). */
export function sanitizeR2KeyPart(value: string) {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'unknown';
  return cleaned;
}
