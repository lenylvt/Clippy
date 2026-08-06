/** Extract pairing code from QR payload, deep link, or plain code. */
export function extractPairingCode(raw: string): string | null {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'clippy:' && url.hostname === 'pair') {
      return url.searchParams.get('code');
    }
  } catch {
    /* plain */
  }
  const m = /code=([A-Z0-9]{6,12})/i.exec(trimmed);
  if (m) return m[1]!.toUpperCase();
  if (/^[A-Z0-9]{6,12}$/i.test(trimmed)) return trimmed.toUpperCase();
  return null;
}
