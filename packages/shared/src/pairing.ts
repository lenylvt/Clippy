/** Pairing codes are 6–12 uppercase alphanumerics (generation uses a subset). */
const PAIRING_CODE_RE = /^[A-Z0-9]{6,12}$/;

function normalizePairingCode(value: string | null | undefined): string | null {
  if (value == null) return null;
  const code = value.trim().toUpperCase();
  if (!code || !PAIRING_CODE_RE.test(code)) return null;
  return code;
}

/** Extract pairing code from QR payload, deep link, or plain code. */
export function extractPairingCode(raw: string): string | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'clippy:' && url.hostname === 'pair') {
      return normalizePairingCode(url.searchParams.get('code'));
    }
  } catch {
    /* plain */
  }

  // Query-style payloads only (URLs / `?code=`), not free text containing `code=`.
  if (/:\/\//.test(trimmed) || trimmed.startsWith('?') || trimmed.startsWith('#')) {
    const m = /(?:^|[?&#])code=([A-Za-z0-9]+)/.exec(trimmed);
    if (m) return normalizePairingCode(m[1]);
  }

  return normalizePairingCode(trimmed);
}
